-- دالة قائمة المنتجات العامة
-- تعرض التصنيفات والمخزون وتمنع الواجهة من تجاوز الكمية المتاحة.

drop function if exists public.get_store_public_products();

create function public.get_store_public_products()
returns table (
  id uuid,
  name text,
  slug text,
  description text,
  short_description text,
  category_name text,
  display_price numeric,
  old_price numeric,
  discount_percent numeric,
  cover_image_path text,
  image_path text,
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
    i.name,
    s.slug,
    s.description,
    s.short_description,
    c.name as category_name,
    coalesce(s.online_price, i.price) as display_price,
    s.old_price,
    case
      when s.old_price is not null
        and s.old_price > 0
        and coalesce(s.online_price, i.price) < s.old_price
      then round(
        (
          (s.old_price - coalesce(s.online_price, i.price))
          / s.old_price
        ) * 100,
        0
      )
      else null
    end as discount_percent,
    s.cover_image_path,
    i.image_path,
    greatest(coalesce(s.stock_quantity, 0), 0)::integer as stock_quantity,
    case
      when coalesce(s.stock_quantity, 0) <= 0 then 'out_of_stock'
      when coalesce(s.stock_quantity, 0) <= 3 then 'low_stock'
      else 'in_stock'
    end::text as stock_status
  from public.store_product_settings as s
  join public.items as i
    on i.id = s.item_id
  left join public.store_categories as c
    on c.id = s.category_id
    and c.is_active = true
  where s.is_published = true
  order by
    c.sort_order nulls last,
    c.name nulls last,
    i.name asc;
$$;

grant execute on function public.get_store_public_products() to anon, authenticated;
