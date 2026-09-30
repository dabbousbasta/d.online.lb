-- دالة إنشاء طلب المتجر.
-- تتحقق من السلة والمخزون والأسعار، ثم تنشئ الطلب وتخصم الكميات.

CREATE OR REPLACE FUNCTION public.create_store_order(customer_data jsonb, cart_items jsonb)
 RETURNS TABLE(order_id uuid, order_number bigint, total_items integer, total_amount numeric, currency_code text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  new_order_id uuid;
  new_order_number bigint;
  calculated_total_items integer := 0;
  calculated_total_amount numeric(12, 2) := 0;
  cart_item jsonb;
  requested_item_id uuid;
  requested_quantity integer;
  requested_line record;
  product_record record;
  calculated_unit_price numeric(12, 2);
  calculated_line_total numeric(12, 2);
  input_customer_name text;
  input_customer_phone text;
  input_customer_email text;
  input_customer_address text;
  input_customer_notes text;
begin
  input_customer_name := nullif(trim(coalesce(customer_data->>'customerName', '')), '');
  input_customer_phone := nullif(trim(coalesce(customer_data->>'phone', '')), '');
  input_customer_email := nullif(trim(coalesce(customer_data->>'email', '')), '');
  input_customer_address := nullif(trim(coalesce(customer_data->>'address', '')), '');
  input_customer_notes := nullif(trim(coalesce(customer_data->>'notes', '')), '');

  if input_customer_name is null
    or input_customer_phone is null
    or input_customer_email is null
    or input_customer_address is null then
    raise exception 'يرجى تعبئة الاسم والهاتف والبريد الإلكتروني والعنوان.';
  end if;

  if jsonb_typeof(cart_items) <> 'array' or jsonb_array_length(cart_items) = 0 then
    raise exception 'سلة الطلب فارغة.';
  end if;

  create temporary table order_item_calculations (
    item_id uuid primary key,
    product_name text,
    product_slug text,
    unit_price numeric(12, 2),
    quantity integer not null,
    line_total numeric(12, 2)
  ) on commit drop;

  for cart_item in
    select value from jsonb_array_elements(cart_items)
  loop
    begin
      requested_item_id := (cart_item->>'id')::uuid;
      requested_quantity := (cart_item->>'quantity')::integer;
    exception
      when others then
        raise exception 'بيانات أحد المنتجات غير صحيحة.';
    end;

    if requested_quantity is null or requested_quantity < 1 then
      raise exception 'كمية المنتج يجب أن تكون أكبر من صفر.';
    end if;

    insert into order_item_calculations (item_id, quantity)
    values (requested_item_id, requested_quantity)
    on conflict (item_id)
    do update
      set quantity = order_item_calculations.quantity + excluded.quantity;
  end loop;

  for requested_line in
    select item_id, quantity
    from order_item_calculations
    order by item_id
  loop
    select
      i.id,
      i.name,
      i.price as base_price,
      s.slug,
      s.online_price,
      s.stock_quantity
    into product_record
    from public.store_product_settings as s
    join public.items as i
      on i.id = s.item_id
    where s.item_id = requested_line.item_id
      and s.is_published = true
      and s.stock_status <> 'out_of_stock'
    for update of s;

    if not found then
      raise exception 'أحد المنتجات لم يعد متوفراً أو منشوراً.';
    end if;

    if product_record.stock_quantity < requested_line.quantity then
      raise exception 'الكمية المطلوبة غير متوفرة للمنتج: %', product_record.name;
    end if;

    calculated_unit_price := coalesce(
      product_record.online_price,
      product_record.base_price
    );

    if calculated_unit_price is null or calculated_unit_price < 0 then
      raise exception 'سعر المنتج غير صالح: %', product_record.name;
    end if;

    calculated_line_total := round(
      calculated_unit_price * requested_line.quantity,
      2
    );

    update order_item_calculations
    set
      product_name = product_record.name,
      product_slug = product_record.slug,
      unit_price = calculated_unit_price,
      line_total = calculated_line_total
    where item_id = product_record.id;

    calculated_total_items := calculated_total_items + requested_line.quantity;
    calculated_total_amount := calculated_total_amount + calculated_line_total;
  end loop;

  insert into public.store_orders (
    customer_name,
    customer_phone,
    customer_email,
    customer_address,
    customer_notes,
    total_items,
    total_amount,
    currency_code,
    status,
    whatsapp_opened_at
  )
  values (
    input_customer_name,
    input_customer_phone,
    input_customer_email,
    input_customer_address,
    input_customer_notes,
    calculated_total_items,
    calculated_total_amount,
    'USD',
    'new',
    now()
  )
  returning
    public.store_orders.id,
    public.store_orders.order_number
  into
    new_order_id,
    new_order_number;

  insert into public.store_order_items (
    order_id,
    item_id,
    product_name,
    product_slug,
    unit_price,
    quantity,
    line_total
  )
  select
    new_order_id,
    calculated.item_id,
    calculated.product_name,
    calculated.product_slug,
    calculated.unit_price,
    calculated.quantity,
    calculated.line_total
  from order_item_calculations as calculated;

  update public.store_product_settings as settings
  set
    stock_quantity = settings.stock_quantity - calculated.quantity,
    stock_status = case
      when settings.stock_quantity - calculated.quantity <= 0 then 'out_of_stock'
      when settings.stock_quantity - calculated.quantity <= 3 then 'low_stock'
      else 'in_stock'
    end
  from order_item_calculations as calculated
  where settings.item_id = calculated.item_id;

  return query
  select
    new_order_id,
    new_order_number,
    calculated_total_items,
    calculated_total_amount,
    'USD'::text;
end;
$function$;
