import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useCart } from '../context/CartContext'

function formatPrice(price) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(Number(price))
}

function normalizeLebaneseWhatsAppNumber(value) {
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

function getFriendlyOrderError(error) {
  const message = String(error?.message ?? '').toLowerCase()
  const code = String(error?.code ?? '').toLowerCase()

  const isStockError =
    message.includes('stock') ||
    message.includes('inventory') ||
    message.includes('quantity') ||
    message.includes('out of stock') ||
    message.includes('insufficient') ||
    message.includes('غير متوفر') ||
    message.includes('المخزون') ||
    code === 'p0001'

  if (isStockError) {
    return 'عذراً، تغيّر مخزون أحد المنتجات أثناء إتمام الطلب. لم يتم حفظ الطلب. عد إلى السلة وعدّل الكمية أو احذف المنتج ثم حاول مجدداً.'
  }

  return 'تعذر حفظ الطلب حالياً. لم يتم إرسال الطلب ولم يتم خصم أي مبلغ. حاول مرة أخرى بعد قليل.'
}

function CheckoutPage() {
  const navigate = useNavigate()
  const { items, totalItems, totalPrice, clearCart } = useCart()

  const [whatsappNumber, setWhatsappNumber] = useState('')
  const [loading, setLoading] = useState(true)
const [submitting, setSubmitting] = useState(false)
const [orderCompleted, setOrderCompleted] = useState(false)
const [errorMessage, setErrorMessage] = useState('')

  const [form, setForm] = useState({
    customerName: '',
    phone: '',
    email: '',
    address: '',
    notes: '',
  })

  useEffect(() => {
    async function loadStoreSettings() {
      const { data, error } = await supabase
        .from('store_settings')
        .select('whatsapp_number')
        .limit(1)
        .maybeSingle()

      if (error) {
        setErrorMessage('تعذر تحميل إعدادات الطلب. حاول مرة أخرى لاحقاً.')
        setLoading(false)
        return
      }

      const normalizedNumber = normalizeLebaneseWhatsAppNumber(
        data?.whatsapp_number,
      )

      if (!normalizedNumber) {
        setErrorMessage(
          'رقم WhatsApp للمتجر غير مُعدّ بعد. تواصل مع إدارة المتجر.',
        )
        setLoading(false)
        return
      }

      setWhatsappNumber(normalizedNumber)
      setLoading(false)
    }

    loadStoreSettings()
  }, [])

  useEffect(() => {
  if (!loading && !orderCompleted && items.length === 0) {
    navigate('/cart', { replace: true })
  }
}, [items.length, loading, navigate, orderCompleted])

  function handleChange(event) {
    const { name, value } = event.target

    setForm((current) => ({
      ...current,
      [name]: value,
    }))
  }

  function buildWhatsAppMessage(orderNumber, normalizedCustomerPhone) {
    const productLines = items
      .map(
        (item, index) =>
          `${index + 1}. ${item.name}\nالكمية: ${item.quantity}\nسعر القطعة: ${formatPrice(item.price)}\nالمجموع: ${formatPrice(item.price * item.quantity)}`,
      )
      .join('\n\n')

    return [
      `طلب جديد رقم #${orderNumber}`,
      'متجر دبوس اونلاين',
      '',
      'بيانات العميل:',
      `الاسم: ${form.customerName.trim()}`,
      `رقم الهاتف: +${normalizedCustomerPhone}`,
      `البريد الإلكتروني: ${form.email.trim()}`,
      `العنوان: ${form.address.trim()}`,
      form.notes.trim() ? `ملاحظات: ${form.notes.trim()}` : '',
      '',
      'المنتجات:',
      productLines,
      '',
      `عدد القطع: ${totalItems}`,
      `الإجمالي: ${formatPrice(totalPrice)}`,
    ]
      .filter(Boolean)
      .join('\n')
  }

  async function handleSubmit(event) {
    event.preventDefault()

    if (submitting) {
      return
    }

    setErrorMessage('')

    if (!form.customerName.trim()) {
      setErrorMessage('يرجى كتابة الاسم الكامل.')
      return
    }

    if (!form.phone.trim()) {
      setErrorMessage('يرجى كتابة رقم الهاتف.')
      return
    }

    if (!form.email.trim() || !form.email.includes('@')) {
      setErrorMessage('يرجى كتابة بريد إلكتروني صحيح.')
      return
    }

    if (!form.address.trim()) {
      setErrorMessage('يرجى كتابة العنوان.')
      return
    }

    if (!whatsappNumber) {
      setErrorMessage('رقم WhatsApp للمتجر غير متوفر حالياً.')
      return
    }

    if (items.length === 0) {
      setErrorMessage('السلة فارغة. عد إلى المتجر وأضف المنتجات أولاً.')
      return
    }

    const normalizedCustomerPhone = normalizeLebaneseWhatsAppNumber(form.phone)

    if (!normalizedCustomerPhone || normalizedCustomerPhone.length < 9) {
      setErrorMessage('يرجى كتابة رقم هاتف لبناني صحيح.')
      return
    }

    setSubmitting(true)

    const customerData = {
      customerName: form.customerName.trim(),
      phone: normalizedCustomerPhone,
      email: form.email.trim(),
      address: form.address.trim(),
      notes: form.notes.trim(),
    }

    const cartItems = items.map((item) => ({
      id: item.id,
      quantity: item.quantity,
    }))

    const { data, error } = await supabase.rpc('create_store_order', {
      customer_data: customerData,
      cart_items: cartItems,
    })

    if (error) {
      setErrorMessage(getFriendlyOrderError(error))
      setSubmitting(false)
      return
    }

    const createdOrder = data?.[0]

    if (!createdOrder?.order_number) {
      setErrorMessage(
        'تعذر تأكيد الطلب بشكل كامل. لم يتم فتح WhatsApp ولم يتم تفريغ السلة. حاول مرة أخرى.',
      )
      setSubmitting(false)
      return
    }

    const message = buildWhatsAppMessage(
  createdOrder.order_number,
  normalizedCustomerPhone,
)

const whatsappUrl = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`

const orderSummary = {
  orderNumber: createdOrder.order_number,
  totalItems: createdOrder.total_items,
  totalAmount: createdOrder.total_amount,
}

window.sessionStorage.setItem(
  'dabous-online-store-last-order',
  JSON.stringify(orderSummary),
)

window.open(whatsappUrl, '_blank', 'noopener,noreferrer')

setOrderCompleted(true)
clearCart()
setSubmitting(false)

navigate('/order-success', {
  replace: true,
  state: {
    order: orderSummary,
  },
})
  }

  if (loading) {
    return (
      <main className="page-state">
        <p>⏳ جارٍ تجهيز صفحة الطلب...</p>
      </main>
    )
  }

  if (errorMessage && !whatsappNumber) {
    return (
      <main className="page-state error-state">
        <h1>تعذر إكمال الطلب</h1>
        <p>{errorMessage}</p>
        <Link className="details-button" to="/cart">
          العودة إلى السلة
        </Link>
      </main>
    )
  }

  return (
    <div className="store-app" dir="rtl">
      <header className="store-header">
        <button
          type="button"
          className="brand brand-home-button"
          onClick={() => navigate('/')}
          aria-label="الذهاب إلى الصفحة الرئيسية"
          title="الذهاب إلى الصفحة الرئيسية"
        >
          <div className="brand-mark">د</div>

          <div className="brand-text">
            <h1>دبوس اونلاين</h1>
            <p>من الأساس حتى التشطيب</p>
          </div>
        </button>

        <button
          type="button"
          className="store-back-button"
          onClick={() => navigate('/cart')}
          disabled={submitting}
        >
          ← العودة إلى السلة
        </button>
      </header>

      <main className="store-content">
        <div className="checkout-layout">
          <section className="checkout-form-card">
            <span className="eyebrow">إكمال الطلب</span>
            <h1>بيانات التواصل والتسليم</h1>
            <p>
              اكتب رقم هاتفك اللبناني كما تستعمله محلياً، مثال: 03 947
              353 أو 70 123 456.
            </p>

            {errorMessage ? (
              <div
                className="checkout-error-message"
                role="alert"
                aria-live="assertive"
              >
                <p>{errorMessage}</p>

                <button
                  type="button"
                  className="checkout-return-cart-button"
                  onClick={() => navigate('/cart')}
                  disabled={submitting}
                >
                  العودة إلى السلة وتعديل الكمية
                </button>
              </div>
            ) : null}

            <form onSubmit={handleSubmit}>
              <label>
                الاسم الكامل
                <input
                  name="customerName"
                  value={form.customerName}
                  onChange={handleChange}
                  autoComplete="name"
                  disabled={submitting}
                  required
                />
              </label>

              <label>
                رقم الهاتف
                <input
                  name="phone"
                  type="tel"
                  value={form.phone}
                  onChange={handleChange}
                  autoComplete="tel"
                  inputMode="tel"
                  placeholder="مثال: 03 947 353"
                  dir="ltr"
                  disabled={submitting}
                  required
                />
              </label>

              <label>
                البريد الإلكتروني
                <input
                  name="email"
                  type="email"
                  value={form.email}
                  onChange={handleChange}
                  autoComplete="email"
                  dir="ltr"
                  disabled={submitting}
                  required
                />
              </label>

              <label>
                العنوان
                <textarea
                  name="address"
                  value={form.address}
                  onChange={handleChange}
                  rows="4"
                  autoComplete="street-address"
                  disabled={submitting}
                  required
                />
              </label>

              <label>
                ملاحظات إضافية (اختياري)
                <textarea
                  name="notes"
                  value={form.notes}
                  onChange={handleChange}
                  rows="3"
                  placeholder="مثال: وقت مناسب للتواصل أو ملاحظة عن التسليم"
                  disabled={submitting}
                />
              </label>

              <button
                type="submit"
                className="details-button checkout-submit-button"
                disabled={submitting}
              >
                {submitting
                  ? 'جارٍ حفظ الطلب...'
                  : 'تأكيد وإرسال الطلب عبر WhatsApp'}
              </button>
            </form>
          </section>

          <aside className="checkout-summary-card">
            <h2>ملخص الطلب</h2>

            <div className="checkout-items-list">
              {items.map((item) => (
                <div key={item.id}>
                  <span>
                    {item.name} × {item.quantity}
                  </span>
                  <strong>{formatPrice(item.price * item.quantity)}</strong>
                </div>
              ))}
            </div>

            <div className="checkout-total-line">
              <span>الإجمالي</span>
              <strong>{formatPrice(totalPrice)}</strong>
            </div>
          </aside>
        </div>
      </main>

      <footer className="store-footer">
        جميع الحقوق محفوظة © {new Date().getFullYear()} دبوس اونلاين
      </footer>
    </div>
  )
}

export default CheckoutPage