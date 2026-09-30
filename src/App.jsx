import { useEffect, useState } from 'react'
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { supabase } from './lib/supabase'
import { CartProvider } from './context/CartContext'
import WhatsAppContactButton from './components/WhatsAppContactButton'
import AdminRoute from './components/admin/AdminRoute'
import StorefrontPage from './pages/StorefrontPage'
import ProductDetailsPage from './pages/ProductDetailsPage'
import CartPage from './pages/CartPage'
import CheckoutPage from './pages/CheckoutPage'
import AdminLoginPage from './pages/admin/AdminLoginPage'
import AdminDashboardPage from './pages/admin/AdminDashboardPage'
import AdminCategoriesPage from './pages/admin/AdminCategoriesPage'
import AdminProductsPage from './pages/admin/AdminProductsPage'
import AdminProductEditPage from './pages/admin/AdminProductEditPage'
import AdminOrdersPage from './pages/admin/AdminOrdersPage'
import AdminOrderDetailsPage from './pages/admin/AdminOrderDetailsPage'
import OrderSuccessPage from './pages/OrderSuccessPage'

function StoreRoutes() {
  return (
    <>
      <Routes>
        <Route path="/" element={<StorefrontPage />} />
        <Route path="/product/:slug" element={<ProductDetailsPage />} />
        <Route path="/cart" element={<CartPage />} />
        <Route path="/checkout" element={<CheckoutPage />} />
        <Route path="/order-success" element={<OrderSuccessPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      <WhatsAppContactButton />
    </>
  )
}

function App() {
  const [authState, setAuthState] = useState({
    loading: true,
    user: null,
    profile: null,
    role: null,
  })

  useEffect(() => {
    let isActive = true

    async function loadAuthState() {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        if (isActive) {
          setAuthState({
            loading: false,
            user: null,
            profile: null,
            role: null,
          })
        }
        return
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('id, display_name, email, role')
        .eq('id', user.id)
        .maybeSingle()

      if (isActive) {
        setAuthState({
          loading: false,
          user,
          profile: profile ?? null,
          role: profile?.role ?? null,
        })
      }
    }

    loadAuthState()

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      loadAuthState()
    })

    return () => {
      isActive = false
      subscription.unsubscribe()
    }
  }, [])

  return (
    <HashRouter>
      <CartProvider>
        <Routes>
          <Route path="/admin/login" element={<AdminLoginPage authState={authState} />} />

          <Route
            path="/admin"
            element={
              <AdminRoute authState={authState}>
                <AdminDashboardPage authState={authState} />
              </AdminRoute>
            }
          />

          <Route
            path="/admin/categories"
            element={
              <AdminRoute authState={authState}>
                <AdminCategoriesPage />
              </AdminRoute>
            }
          />

          <Route
            path="/admin/products"
            element={
              <AdminRoute authState={authState}>
                <AdminProductsPage />
              </AdminRoute>
            }
          />

          <Route
            path="/admin/products/:itemId"
            element={
              <AdminRoute authState={authState}>
                <AdminProductEditPage />
              </AdminRoute>
            }
          />

          <Route
            path="/admin/orders"
            element={
              <AdminRoute authState={authState}>
                <AdminOrdersPage />
              </AdminRoute>
            }
          />

          <Route
            path="/admin/orders/:orderId"
            element={
              <AdminRoute authState={authState}>
                <AdminOrderDetailsPage />
              </AdminRoute>
            }
          />

          <Route path="/*" element={<StoreRoutes />} />
        </Routes>
      </CartProvider>
    </HashRouter>
  )
}

export default App