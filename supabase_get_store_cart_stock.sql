-- دالة تحديث مخزون منتجات السلة.
-- تستقبل قائمة IDs وتعيد المخزون والحالة للمنتجات المنشورة فقط.

drop function if exists public.get_store_cart_stock(uuid[]);

create function public.get_store_cart_stock(product_ids uuid[])
returns table (
  id uuid,
  stock_quantity integer,
  stock_status text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    i.id,
    greatest(coalesce(s.stock_quantity, 0), 0)::integer as stock_quantity,
    case
      when coalesce(s.stock_quantity, 0) <= 0 then 'out_of_stock'
      when coalesce(s.stock_quantity, 0) <= 3 then 'low_stock'
      else 'in_stock'
    end::text as stock_status
  from public.store_product_settings as s
  join public.items as i
    on i.id = s.item_id
  where s.is_published = true
    and i.id = any(product_ids);
$$;

grant execute on function public.get_store_cart_stock(uuid[]) to anon, authenticated;
