import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

const ORDER_STATUS_OPTIONS = [
  { value: 'new', label: 'جديد' },
  { value: 'under_review', label: 'قيد المراجعة' },
  { value: 'contacted_customer', label: 'تم التواصل مع العميل' },
  { value: 'preparing', label: 'قيد التجهيز' },
  { value: 'shipped', label: 'تم الشحن' },
  { value: 'completed', label: 'مكتمل' },
  { value: 'cancelled', label: 'ملغي' },
]

function formatPrice(price) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(Number(price ?? 0))
}

function formatDate(dateValue) {
  if (!dateValue) {
    return '—'
  }

  return new Intl.DateTimeFormat('ar', {
    dateStyle: 'full',
    timeStyle: 'short',
  }).format(new Date(dateValue))
}

function cleanWhatsAppNumber(value) {
  const digits = String(value ?? '').replace(/\D/g, '')

  if (!digits) {
    return ''
  }

  if (digits.startsWith('961')) {
    return digits
  }

  if (digits.startsWith('0')) {
    return `961${digits.slice(1)}`
  }

  return `961${digits}`
}

function getStatusLabel(status) {
  return (
    ORDER_STATUS_OPTIONS.find((option) => option.value === status)?.label ??
    status ??
    '—'
  )
}

function getStatusClass(status) {
  const classes = {
    new: 'new',
    under_review: 'under-review',
    contacted_customer: 'contacted-customer',
    preparing: 'preparing',
    shipped: 'shipped',
    completed: 'completed',
    cancelled: 'cancelled',
  }

  return classes[status] ?? 'new'
}

function AdminOrderDetailsPage() {
  const navigate = useNavigate()
  const { orderId } = useParams()

  const [order, setOrder] = useState(null)
  const [orderItems, setOrderItems] = useState([])
  const [selectedStatus, setSelectedStatus] = useState('')
  const [adminNotes, setAdminNotes] = useState('')
  const [loading, setLoading] = useState(true)
  const [savingStatus, setSavingStatus] = useState(false)
  const [savingNotes, setSavingNotes] = useState(false)
  const [contactingCustomer, setContactingCustomer] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')

  useEffect(() => {
    async function loadOrderDetails() {
      setLoading(true)
      setErrorMessage('')
      setSuccessMessage('')

      const [orderResult, itemsResult] = await Promise.all([
        supabase
          .from('store_orders')
          .select(`
            id,
            order_number,
            status,
            customer_name,
            customer_phone,
            customer_email,
            customer_address,
            customer_notes,
            city,
            address,
            notes,
            total_items,
            total_amount,
            subtotal,
            total,
            currency_code,
            created_at,
            updated_at,
            whatsapp_opened_at
          `)
          .eq('id', orderId)
          .maybeSingle(),

        supabase
          .from('store_order_items')
          .select(`
            id,
            product_name,
            product_slug,
            unit_price,
            quantity,
            line_total,
            created_at
          `)
          .eq('order_id', orderId)
          .order('created_at', { ascending: true }),
      ])

      if (orderResult.error) {
        setErrorMessage(`تعذر تحميل تفاصيل الطلب: ${orderResult.error.message}`)
        setLoading(false)
        return
      }

      if (itemsResult.error) {
        setErrorMessage(`تعذر تحميل منتجات الطلب: ${itemsResult.error.message}`)
        setLoading(false)
        return
      }

      if (!orderResult.data) {
        setErrorMessage('لم يتم العثور على هذا الطلب.')
        setLoading(false)
        return
      }

      setOrder(orderResult.data)
      setOrderItems(itemsResult.data ?? [])
      setSelectedStatus(orderResult.data.status)
      setAdminNotes(orderResult.data.notes ?? '')
      setLoading(false)
    }

    loadOrderDetails()
  }, [orderId])

  function clearMessages() {
    setErrorMessage('')
    setSuccessMessage('')
  }

  async function handleSaveStatus() {
    if (!order || !selectedStatus || selectedStatus === order.status) {
      return
    }

    setSavingStatus(true)
    clearMessages()

    const { data, error } = await supabase
      .from('store_orders')
      .update({ status: selectedStatus })
      .eq('id', order.id)
      .select('status, updated_at')
      .maybeSingle()

    if (error) {
      setErrorMessage(`تعذر حفظ حالة الطلب: ${error.message}`)
      setSavingStatus(false)
      return
    }

    if (!data) {
      setErrorMessage('لم يتم العثور على الطلب أثناء محاولة حفظ الحالة.')
      setSavingStatus(false)
      return
    }

    setOrder((currentOrder) => ({
      ...currentOrder,
      status: data.status,
      updated_at: data.updated_at,
    }))

    setSelectedStatus(data.status)
    setSuccessMessage('تم حفظ حالة الطلب بنجاح.')
    setSavingStatus(false)
  }

  async function handleSaveAdminNotes() {
    if (!order) {
      return
    }

    setSavingNotes(true)
    clearMessages()

    const notesValue = adminNotes.trim() || null

    const { data, error } = await supabase
      .from('store_orders')
      .update({ notes: notesValue })
      .eq('id', order.id)
      .select('notes, updated_at')
      .maybeSingle()

    if (error) {
      setErrorMessage(`تعذر حفظ الملاحظات الداخلية: ${error.message}`)
      setSavingNotes(false)
      return
    }

    if (!data) {
      setErrorMessage('لم يتم العثور على الطلب أثناء محاولة حفظ الملاحظات.')
      setSavingNotes(false)
      return
    }

    setOrder((currentOrder) => ({
      ...currentOrder,
      notes: data.notes,
      updated_at: data.updated_at,
    }))

    setAdminNotes(data.notes ?? '')
    setSuccessMessage('تم حفظ الملاحظات الداخلية بنجاح.')
    setSavingNotes(false)
  }

  async function handleContactCustomer() {
    if (!order || contactingCustomer) {
      return
    }

    const customerWhatsApp = cleanWhatsAppNumber(order.customer_phone)

    if (!customerWhatsApp) {
      setErrorMessage('رقم هاتف العميل غير صالح لفتح WhatsApp.')
      return
    }

    setContactingCustomer(true)
    clearMessages()

    const contactTime = new Date().toISOString()

    const { data, error } = await supabase
      .from('store_orders')
      .update({
        status: 'contacted_customer',
        whatsapp_opened_at: contactTime,
      })
      .eq('id', order.id)
      .select('status, whatsapp_opened_at, updated_at')
      .maybeSingle()

    if (error) {
      setErrorMessage(`تعذر تسجيل التواصل مع العميل: ${error.message}`)
      setContactingCustomer(false)
      return
    }

    if (!data) {
      setErrorMessage('لم يتم العثور على الطلب أثناء تسجيل التواصل.')
      setContactingCustomer(false)
      return
    }

    setOrder((currentOrder) => ({
      ...currentOrder,
      status: data.status,
      whatsapp_opened_at: data.whatsapp_opened_at,
      updated_at: data.updated_at,
    }))

    setSelectedStatus(data.status)
    setSuccessMessage('تم تسجيل التواصل مع العميل وفتح WhatsApp.')

    const message = [
      `مرحباً ${order.customer_name}،`,
      '',
      `نتواصل معك بخصوص طلبك رقم #${order.order_number} من متجر دبوس اونلاين.`,
      'نحن جاهزون لمساعدتك في تأكيد الطلب أو الإجابة عن أي استفسار.',
      '',
      'شكراً لثقتك بنا.',
    ].join('\n')

    const whatsappUrl = `https://wa.me/${customerWhatsApp}?text=${encodeURIComponent(message)}`

    window.open(whatsappUrl, '_blank', 'noopener,noreferrer')
    setContactingCustomer(false)
  }

  if (loading) {
    return (
      <main className="admin-page" dir="rtl">
        <p className="admin-loading">جارٍ تحميل تفاصيل الطلب...</p>
      </main>
    )
  }

  if (errorMessage && !order) {
    return (
      <main className="admin-page" dir="rtl">
        <header className="admin-page-header">
          <button
            type="button"
            className="text-back-button"
            onClick={() => navigate('/admin/orders')}
          >
            ← العودة إلى الطلبات
          </button>

          <div>
            <p className="admin-kicker">إدارة الطلبات</p>
            <h1>تعذر فتح الطلب</h1>
          </div>
        </header>

        <p className="admin-alert error-alert">{errorMessage}</p>
      </main>
    )
  }

  if (!order) {
    return null
  }

  const orderTotal = order.total_amount ?? order.total ?? 0
  const orderSubtotal = order.subtotal ?? orderTotal
  const customerAddress = order.customer_address || order.address || '—'
  const customerNotes = order.customer_notes || '—'
  const totalItems =
    order.total_items ??
    orderItems.reduce(
      (sum, item) => sum + Number(item.quantity ?? 0),
      0,
    )

  return (
    <main className="admin-page" dir="rtl">
      <header className="admin-page-header">
        <button
          type="button"
          className="text-back-button"
          onClick={() => navigate('/admin/orders')}
        >
          ← العودة إلى الطلبات
        </button>

        <div>
          <p className="admin-kicker">إدارة الطلبات</p>
          <h1>تفاصيل الطلب #{order.order_number}</h1>
          <p>
            تم إنشاء الطلب في: {formatDate(order.created_at)}
            {order.updated_at
              ? ` — آخر تحديث: ${formatDate(order.updated_at)}`
              : ''}
          </p>
        </div>
      </header>

      {errorMessage ? (
        <p className="admin-alert error-alert">{errorMessage}</p>
      ) : null}

      {successMessage ? (
        <p className="admin-alert success-alert">{successMessage}</p>
      ) : null}

      <section className="admin-order-details-grid">
        <article className="admin-list-card">
          <div className="admin-section-heading">
            <h2>بيانات العميل</h2>

            <span
              className={`order-status-pill ${getStatusClass(order.status)}`}
            >
              {getStatusLabel(order.status)}
            </span>
          </div>

          <dl className="order-details-list">
            <div>
              <dt>الاسم</dt>
              <dd>{order.customer_name}</dd>
            </div>

            <div>
              <dt>رقم الهاتف</dt>
              <dd dir="ltr">{order.customer_phone}</dd>
            </div>

            <div>
              <dt>البريد الإلكتروني</dt>
              <dd dir="ltr">{order.customer_email || '—'}</dd>
            </div>

            <div>
              <dt>المدينة</dt>
              <dd>{order.city || '—'}</dd>
            </div>

            <div>
              <dt>العنوان</dt>
              <dd className="order-details-multiline">{customerAddress}</dd>
            </div>

            <div>
              <dt>ملاحظات العميل</dt>
              <dd className="order-details-multiline">{customerNotes}</dd>
            </div>

            <div>
              <dt>WhatsApp</dt>
              <dd>
                {order.whatsapp_opened_at
                  ? `تم فتحه في ${formatDate(order.whatsapp_opened_at)}`
                  : 'لم يتم تسجيل وقت الفتح'}
              </dd>
            </div>
          </dl>

          <button
            type="button"
            className="contact-customer-button"
            onClick={handleContactCustomer}
            disabled={contactingCustomer}
          >
            {contactingCustomer
              ? 'جارٍ فتح WhatsApp...'
              : 'التواصل مع العميل عبر WhatsApp'}
          </button>
        </article>

        <aside className="admin-list-card order-total-card">
          <h2>ملخص الطلب</h2>

          <div className="order-total-line">
            <span>عدد القطع</span>
            <strong>{totalItems}</strong>
          </div>

          <div className="order-total-line">
            <span>المجموع الفرعي</span>
            <strong>{formatPrice(orderSubtotal)}</strong>
          </div>

          <div className="order-total-line order-grand-total">
            <span>الإجمالي</span>
            <strong>{formatPrice(orderTotal)}</strong>
          </div>

          <p>العملة: {order.currency_code || 'USD'}</p>
        </aside>
      </section>

      <section className="admin-list-card order-status-card">
        <div className="admin-section-heading">
          <div>
            <h2>حالة الطلب</h2>
            <p className="order-status-helper">
              اختر الحالة الجديدة ثم اضغط حفظ لتحديث الطلب.
            </p>
          </div>
        </div>

        <div className="order-status-form">
          <select
            value={selectedStatus}
            onChange={(event) => {
              setSelectedStatus(event.target.value)
              setSuccessMessage('')
            }}
            disabled={savingStatus || contactingCustomer}
            aria-label="حالة الطلب"
          >
            {ORDER_STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          <button
            type="button"
            className="admin-primary-button"
            onClick={handleSaveStatus}
            disabled={
              savingStatus ||
              contactingCustomer ||
              selectedStatus === order.status
            }
          >
            {savingStatus ? 'جارٍ الحفظ...' : 'حفظ حالة الطلب'}
          </button>
        </div>
      </section>

      <section className="admin-list-card admin-notes-card">
        <div className="admin-section-heading">
          <div>
            <h2>ملاحظات الإدارة الداخلية</h2>
            <p className="order-status-helper">
              هذه الملاحظة للفريق فقط ولا تظهر للعميل.
            </p>
          </div>
        </div>

        <textarea
          className="admin-order-notes-input"
          value={adminNotes}
          onChange={(event) => {
            setAdminNotes(event.target.value)
            setSuccessMessage('')
          }}
          placeholder="مثال: تم تأكيد اللون مع العميل، التسليم صباح الثلاثاء."
          rows="5"
          disabled={savingNotes}
        />

        <div className="admin-notes-actions">
          <button
            type="button"
            className="admin-primary-button"
            onClick={handleSaveAdminNotes}
            disabled={savingNotes}
          >
            {savingNotes ? 'جارٍ حفظ الملاحظات...' : 'حفظ الملاحظات'}
          </button>

          {adminNotes !== (order.notes ?? '') ? (
            <span className="unsaved-notes-indicator">
              توجد تعديلات غير محفوظة
            </span>
          ) : null}
        </div>
      </section>

      <section className="admin-list-card">
        <div className="admin-section-heading">
          <h2>منتجات الطلب</h2>
          <span className="count-chip">{totalItems}</span>
        </div>

        {orderItems.length === 0 ? (
          <p className="admin-empty">لا توجد منتجات مسجلة لهذا الطلب.</p>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table order-items-table">
              <thead>
                <tr>
                  <th>المنتج</th>
                  <th>سعر القطعة</th>
                  <th>الكمية</th>
                  <th>الإجمالي</th>
                </tr>
              </thead>

              <tbody>
                {orderItems.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <strong>{item.product_name}</strong>

                      {item.product_slug ? (
                        <small dir="ltr">{item.product_slug}</small>
                      ) : null}
                    </td>

                    <td>{formatPrice(item.unit_price)}</td>
                    <td>{item.quantity}</td>

                    <td>
                      <strong>{formatPrice(item.line_total)}</strong>
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

export default AdminOrderDetailsPage