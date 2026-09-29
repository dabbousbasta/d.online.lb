import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

function createSlug(value) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u0600-\u06ff]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function AdminCategoriesPage() {
  const navigate = useNavigate()

  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [editingId, setEditingId] = useState(null)

  const [form, setForm] = useState({
    name: '',
    slug: '',
    description: '',
    sort_order: 0,
    is_active: true,
  })

  async function loadCategories() {
    setLoading(true)
    setErrorMessage('')

    const { data, error } = await supabase
  .from('store_categories')
  .select('id, name, slug, description, sort_order, is_active, created_at')
  .order('sort_order', { ascending: true })
  .order('name', { ascending: true })

if (error) {
  setErrorMessage(`تعذر تحميل التصنيفات: ${error.message}`)
  setLoading(false)
  return
}

const categoryIds = (data ?? []).map((category) => category.id)

const { data: productSettings, error: productsError } = categoryIds.length
  ? await supabase
      .from('store_product_settings')
      .select('category_id')
      .in('category_id', categoryIds)
  : { data: [], error: null }

if (productsError) {
  setErrorMessage(`تعذر تحميل أعداد المنتجات: ${productsError.message}`)
  setLoading(false)
  return
}

const productsCountByCategory = (productSettings ?? []).reduce(
  (counts, product) => {
    if (product.category_id) {
      counts[product.category_id] = (counts[product.category_id] ?? 0) + 1
    }

    return counts
  },
  {},
)

const categoriesWithProductCounts = (data ?? []).map((category) => ({
  ...category,
  productsCount: productsCountByCategory[category.id] ?? 0,
}))
    if (error) {
      setErrorMessage(`تعذر تحميل التصنيفات: ${error.message}`)
      setLoading(false)
      return
    }

    setCategories(categoriesWithProductCounts)
    setLoading(false)
  }

  useEffect(() => {
    loadCategories()
  }, [])

  function resetForm() {
    setEditingId(null)
    setForm({
      name: '',
      slug: '',
      description: '',
      sort_order: 0,
      is_active: true,
    })
  }

  function handleChange(event) {
    const { name, value, type, checked } = event.target

    setForm((current) => ({
      ...current,
      [name]: type === 'checkbox' ? checked : value,
      ...(name === 'name' && !editingId
        ? { slug: createSlug(value) }
        : {}),
    }))
  }

  function startEditing(category) {
    setMessage('')
    setErrorMessage('')
    setEditingId(category.id)
    setForm({
      name: category.name ?? '',
      slug: category.slug ?? '',
      description: category.description ?? '',
      sort_order: category.sort_order ?? 0,
      is_active: category.is_active,
    })

    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function handleSubmit(event) {
    event.preventDefault()
    setSaving(true)
    setMessage('')
    setErrorMessage('')

    const payload = {
      name: form.name.trim(),
      slug: createSlug(form.slug),
      description: form.description.trim() || null,
      sort_order: Number(form.sort_order) || 0,
      is_active: form.is_active,
    }

    if (!payload.name || !payload.slug) {
      setErrorMessage('يرجى كتابة اسم التصنيف والرابط المختصر.')
      setSaving(false)
      return
    }

    const request = editingId
      ? supabase.from('store_categories').update(payload).eq('id', editingId)
      : supabase.from('store_categories').insert(payload)

    const { error } = await request

    
    setMessage(editingId ? 'تم تعديل التصنيف بنجاح.' : 'تمت إضافة التصنيف بنجاح.')
    resetForm()
    setSaving(false)
    loadCategories()
  }

  async function handleDelete(category) {
    if (category.productsCount > 0) {
  setMessage('')
  setErrorMessage(
    `لا يمكن حذف تصنيف "${category.name}" لأنه مرتبط بـ ${category.productsCount} منتجاً. انقل المنتجات إلى تصنيف آخر أو اختر "بدون تصنيف" من صفحة المنتجات أولاً.`,
  )
  return
}
    const confirmed = window.confirm(
      `هل تريد حذف التصنيف "${category.name}"؟\n\nلن يتم الحذف إذا كان مرتبطاً بمنتجات.`,
    )

    if (!confirmed) {
      return
    }

    setMessage('')
    setErrorMessage('')

    const { error } = await supabase
      .from('store_categories')
      .delete()
      .eq('id', category.id)

    if (error) {
      setErrorMessage(
        `تعذر حذف التصنيف. قد يكون مرتبطاً بمنتجات: ${error.message}`,
      )
      return
    }

    setMessage('تم حذف التصنيف بنجاح.')
    loadCategories()
  }

  return (
    <main className="admin-page" dir="rtl">
      <header className="admin-page-header">
        <div>
          <button
            type="button"
            className="text-back-button"
            onClick={() => navigate('/admin')}
          >
            ← العودة إلى لوحة الإدارة
          </button>
          <p className="admin-kicker">إدارة المتجر</p>
          <h1>التصنيفات</h1>
          <p>أنشئ التصنيفات ورتّبها وأظهر أو أخفِ ما تريد عرضه في المتجر.</p>
        </div>
      </header>

      {message ? <p className="admin-alert success-alert">{message}</p> : null}
      {errorMessage ? <p className="admin-alert error-alert">{errorMessage}</p> : null}

      <section className="admin-form-card">
        <div className="admin-section-heading">
          <h2>{editingId ? 'تعديل التصنيف' : 'إضافة تصنيف جديد'}</h2>
          {editingId ? (
            <button type="button" className="secondary-button" onClick={resetForm}>
              إلغاء التعديل
            </button>
          ) : null}
        </div>

        <form className="admin-form-grid" onSubmit={handleSubmit}>
          <label>
            اسم التصنيف
            <input
              name="name"
              value={form.name}
              onChange={handleChange}
              placeholder="مثال: مضخات مياه"
              required
            />
          </label>

          <label>
            الرابط المختصر
            <input
              name="slug"
              value={form.slug}
              onChange={handleChange}
              placeholder="water-pumps"
              dir="ltr"
              required
            />
          </label>

          <label className="full-width-field">
            وصف مختصر
            <textarea
              name="description"
              value={form.description}
              onChange={handleChange}
              placeholder="وصف اختياري يظهر لاحقاً في صفحة التصنيف"
              rows="3"
            />
          </label>

          <label>
            ترتيب العرض
            <input
              name="sort_order"
              type="number"
              min="0"
              value={form.sort_order}
              onChange={handleChange}
            />
          </label>

          <label className="checkbox-field">
            <input
              name="is_active"
              type="checkbox"
              checked={form.is_active}
              onChange={handleChange}
            />
            إظهار التصنيف في المتجر
          </label>

          <div className="full-width-field form-actions">
            <button type="submit" className="admin-primary-button" disabled={saving}>
              {saving
                ? 'جارٍ الحفظ...'
                : editingId
                  ? 'حفظ التعديلات'
                  : 'إضافة التصنيف'}
            </button>
          </div>
        </form>
      </section>

      <section className="admin-list-card">
        <div className="admin-section-heading">
          <h2>التصنيفات الحالية</h2>
          <span className="count-chip">{categories.length}</span>
        </div>

        {loading ? (
          <p className="admin-loading">جارٍ تحميل التصنيفات...</p>
        ) : categories.length === 0 ? (
          <p className="admin-empty">لا توجد تصنيفات بعد.</p>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>الترتيب</th>
                  <th>الاسم</th>
                  <th>الرابط</th>
<th>المنتجات</th>
<th>الحالة</th>
                  <th>الإجراءات</th>
                </tr>
              </thead>
              <tbody>
                {categories.map((category) => (
                  <tr key={category.id}>
                    <td>{category.sort_order}</td>
                    <td>
                      <strong>{category.name}</strong>
                      {category.description ? (
                        <small>{category.description}</small>
                      ) : null}
                    </td>
                    <td dir="ltr">{category.slug}</td>
                    <td>
  <span className="category-products-count">
    {category.productsCount} منتج
  </span>
</td>
                    <td>
                      <span className={category.is_active ? 'status-pill active' : 'status-pill hidden'}>
                        {category.is_active ? 'ظاهر' : 'مخفي'}
                      </span>
                    </td>
                    <td>
                      <div className="table-actions">
                        <button
                          type="button"
                          className="table-edit-button"
                          onClick={() => startEditing(category)}
                        >
                          تعديل
                        </button>
                        <button
                          type="button"
                          className="table-delete-button"
                          onClick={() => handleDelete(category)}
                        >
                          حذف
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  )
}

export default AdminCategoriesPage