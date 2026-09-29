import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

const ORDER_STATUS_OPTIONS = [
  { value: 'all', label: 'كل الطلبات' },
  { value: 'new', label: 'جديد' },
  { value: 'under_review', label: 'قيد المراجعة' },
  { value: 'contacted_customer', label: 'تم التواصل مع العميل' },
  { value: 'preparing', label: 'قيد التجهيز' },
  { value: 'shipped', label: 'تم الشحن' },
  { value: 'completed', label: 'مكتمل' },
  { value: 'cancelled', label: 'ملغي' },
]

const SUMMARY_STATUSES = [
  { value: 'new', label: 'جديد' },
  { value: 'under_review', label: 'قيد المراجعة' },
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
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(dateValue))
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

function getOrderTotal(order) {
  return Number(order.total_amount ?? order.total ?? 0)
}

function AdminOrdersPage() {
  const navigate = useNavigate()

  const [orders, setOrders] = useState([])
  const [selectedStatus, setSelectedStatus] = useState('all')
  const [searchInput, setSearchInput] = useState('')
  const [searchText, setSearchText] = useState('')
  const [loading, setLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    async function loadOrders() {
      setLoading(true)
      setErrorMessage('')

      let query = supabase
        .from('store_orders')
        .select(`
          id,
          order_number,
          status,
          customer_name,
          customer_phone,
          customer_email,
          city,
          customer_address,
          total_items,
          total_amount,
          total,
          currency_code,
          created_at
        `)
        .order('created_at', { ascending: false })

      
      const { data, error } = await query

      if (error) {
        setErrorMessage(`تعذر تحميل الطلبات: ${error.message}`)
        setLoading(false)
        return
      }

      setOrders(data ?? [])
      setLoading(false)
    }

    loadOrders()
  }, [selectedStatus])

  const filteredOrders = useMemo(() => {
  const searchValue = searchText.trim().toLowerCase()

  return orders.filter((order) => {
    const matchesStatus =
      selectedStatus === 'all' || order.status === selectedStatus

    if (!matchesStatus) {
      return false
    }

    if (!searchValue) {
      return true
    }

    const searchableText = [
      order.order_number,
      order.customer_name,
      order.customer_phone,
      order.customer_email,
      order.city,
      order.customer_address,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()

    return searchableText.includes(searchValue)
  })
}, [orders, searchText, selectedStatus])

  const statusCounts = useMemo(() => {
    return orders.reduce(
      (counts, order) => {
        counts.all += 1
        counts[order.status] = (counts[order.status] ?? 0) + 1
        return counts
      },
      { all: 0 },
    )
  }, [orders])

  const visibleOrdersTotal = useMemo(
    () =>
      filteredOrders.reduce(
        (total, order) => total + getOrderTotal(order),
        0,
      ),
    [filteredOrders],
  )

  const selectedStatusLabel =
    getStatusLabel(selectedStatus) || 'كل الطلبات'

  function handleSearch(event) {
    event.preventDefault()
    setSearchText(searchInput)
  }

  function clearSearch() {
    setSearchInput('')
    setSearchText('')
  }

  function selectStatus(status) {
    setSelectedStatus(status)
  }

  return (
    <main className="admin-page" dir="rtl">
      <header className="admin-page-header">
        <button
          type="button"
          className="text-back-button"
          onClick={() => navigate('/admin')}
        >
          ← العودة إلى لوحة الإدارة
        </button>

        <div>
          <p className="admin-kicker">إدارة الطلبات</p>
          <h1>طلبات العملاء</h1>
          <p>
            ابحث عن العميل أو رقم الطلب، وراجع توزيع الحالات قبل فتح تفاصيل كل
            طلب.
          </p>
        </div>
      </header>

      {errorMessage ? (
        <p className="admin-alert error-alert">{errorMessage}</p>
      ) : null}

      <section className="admin-order-summary-grid">
        <button
          type="button"
          className={
            selectedStatus === 'all'
              ? 'order-summary-card active'
              : 'order-summary-card'
          }
          onClick={() => selectStatus('all')}
        >
          <span>كل الطلبات</span>
          <strong>{statusCounts.all ?? 0}</strong>
        </button>

        {SUMMARY_STATUSES.map((status) => (
          <button
            key={status.value}
            type="button"
            className={
              selectedStatus === status.value
                ? `order-summary-card ${getStatusClass(status.value)} active`
                : `order-summary-card ${getStatusClass(status.value)}`
            }
            onClick={() => selectStatus(status.value)}
          >
            <span>{status.label}</span>
            <strong>{statusCounts[status.value] ?? 0}</strong>
          </button>
        ))}
      </section>

      <section className="admin-list-card">
        <div className="admin-orders-toolbar">
          <div>
            <h2>{selectedStatusLabel}</h2>
            <p>
              {searchText
                ? `نتائج البحث عن: ${searchText}`
                : 'اختر حالة أو استخدم البحث للوصول إلى الطلب بسرعة.'}
            </p>
          </div>

          <label className="order-filter-field">
            <span>فلترة حسب الحالة</span>
            <select
              value={selectedStatus}
              onChange={(event) => selectStatus(event.target.value)}
              disabled={loading}
            >
              {ORDER_STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <span className="count-chip">{filteredOrders.length}</span>
        </div>

        <form className="admin-order-search-form" onSubmit={handleSearch}>
          <input
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="ابحث برقم الطلب أو اسم العميل أو الهاتف أو البريد أو العنوان"
            aria-label="البحث في الطلبات"
          />

          <button type="submit" className="admin-primary-button">
            بحث
          </button>

          {searchText ? (
            <button
              type="button"
              className="secondary-button"
              onClick={clearSearch}
            >
              مسح البحث
            </button>
          ) : null}
        </form>

        {!loading && filteredOrders.length > 0 ? (
          <div className="admin-orders-total-strip">
            <span>إجمالي الطلبات الظاهرة</span>
            <strong>{formatPrice(visibleOrdersTotal)}</strong>
          </div>
        ) : null}

        {loading ? (
          <p className="admin-loading">جارٍ تحميل الطلبات...</p>
        ) : filteredOrders.length === 0 ? (
          <p className="admin-empty">
            لا توجد طلبات مطابقة للحالة أو البحث المحدد.
          </p>
        ) : (
          <div className="admin-table-wrap">
            <table className="admin-table orders-table">
              <thead>
                <tr>
                  <th>رقم الطلب</th>
                  <th>العميل</th>
                  <th>القطع</th>
                  <th>الإجمالي</th>
                  <th>الحالة</th>
                  <th>تاريخ الطلب</th>
                  <th>التفاصيل</th>
                </tr>
              </thead>

              <tbody>
                {filteredOrders.map((order) => {
                  const orderTotal = getOrderTotal(order)
                  const itemsCount = order.total_items ?? 0

                  return (
                    <tr key={order.id}>
                      <td>
                        <strong>#{order.order_number}</strong>
                      </td>

                      <td>
                        <strong>{order.customer_name}</strong>
                        <small dir="ltr">{order.customer_phone}</small>

                        {order.customer_email ? (
                          <small dir="ltr">{order.customer_email}</small>
                        ) : null}

                        {order.city || order.customer_address ? (
                          <small>
                            {[order.city, order.customer_address]
                              .filter(Boolean)
                              .join(' — ')}
                          </small>
                        ) : null}
                      </td>

                      <td>{itemsCount}</td>

                      <td>
                        <strong>{formatPrice(orderTotal)}</strong>
                      </td>

                      <td>
                        <span
                          className={`order-status-pill ${getStatusClass(order.status)}`}
                        >
                          {getStatusLabel(order.status)}
                        </span>
                      </td>

                      <td>
                        <small>{formatDate(order.created_at)}</small>
                      </td>

                      <td>
                        <button
                          type="button"
                          className="table-edit-button"
                          onClick={() => navigate(`/admin/orders/${order.id}`)}
                        >
                          عرض التفاصيل
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  )
}

export default AdminOrdersPage