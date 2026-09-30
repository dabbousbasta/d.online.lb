import { useMemo } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

const LAST_ORDER_STORAGE_KEY = 'dabous-online-store-last-order'

function formatPrice(price) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(Number(price))
}

function getSavedOrder() {
  try {
    const savedOrder = window.sessionStorage.getItem(
      LAST_ORDER_STORAGE_KEY,
    )

    if (!savedOrder) {
      return null
    }

    const parsedOrder = JSON.parse(savedOrder)

    if (!parsedOrder?.orderNumber) {
      return null
    }

    return parsedOrder
  } catch {
    return null
  }
}

function OrderSuccessPage() {
  const navigate = useNavigate()
  const location = useLocation()

  const order = useMemo(
    () => location.state?.order ?? getSavedOrder(),
    [location.state],
  )

  if (!order?.orderNumber) {
    return (
      <div className="store-app" dir="rtl">
        <header className="store-header">
          <button
            type="button"
            className="brand brand-home-button"
            onClick={() => navigate('/')}
            aria-label="الذهاب إلى الصفحة الرئيسية"
          >
            <div className="brand-mark">د</div>

            <div className="brand-text">
              <h1>دبوس اونلاين</h1>
              <p>من الأساس حتى التشطيب</p>
            </div>
          </button>
        </header>

        <main className="store-content">
          <section className="empty-state">
            <h1>لا توجد بيانات طلب لعرضها</h1>
            <p>
              أكمل الطلب من السلة لتظهر هنا تفاصيل نجاحه.
            </p>

            <button
              type="button"
              className="details-button"
              onClick={() => navigate('/')}
            >
              العودة إلى المتجر
            </button>
          </section>
        </main>
      </div>
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
      </header>

      <main className="store-content">
        <section className="order-success-card">
          <span className="order-success-icon" aria-hidden="true">
            ✓
          </span>

          <span className="eyebrow">تم تسجيل الطلب</span>

          <h1>شكراً لك، تم إنشاء طلبك بنجاح</h1>

          <p>
            رقم طلبك هو <strong>#{order.orderNumber}</strong>
          </p>

          <p>
            تم فتح WhatsApp لإرسال تفاصيل الطلب إلى المتجر. إذا لم تفتح
            النافذة تلقائياً، يمكنك التواصل مع المتجر مباشرة.
          </p>

          <div className="order-success-summary">
            <div>
              <span>عدد القطع</span>
              <strong>{order.totalItems}</strong>
            </div>

            <div>
              <span>إجمالي الطلب</span>
              <strong>{formatPrice(order.totalAmount)}</strong>
            </div>
          </div>

          <button
            type="button"
            className="details-button order-success-home-button"
            onClick={() => navigate('/', { replace: true })}
          >
            العودة إلى المتجر
          </button>
        </section>
      </main>

      <footer className="store-footer">
        جميع الحقوق محفوظة © {new Date().getFullYear()} دبوس اونلاين
      </footer>
    </div>
  )
}

export default OrderSuccessPage