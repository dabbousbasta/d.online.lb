import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'

const CartContext = createContext(null)
const CART_STORAGE_KEY = 'dabous-online-store-cart'

function normalizeQuantity(value) {
  const quantity = Number(value)

  if (!Number.isFinite(quantity)) {
    return 1
  }

  return Math.max(1, Math.floor(quantity))
}

function getAvailableStock(product) {
  const stockQuantity = Number(product?.stock_quantity)

  if (!Number.isFinite(stockQuantity)) {
    return null
  }

  return Math.max(0, Math.floor(stockQuantity))
}

function limitQuantityToStock(quantity, stockQuantity) {
  const normalizedQuantity = normalizeQuantity(quantity)

  if (stockQuantity === null) {
    return normalizedQuantity
  }

  return Math.min(normalizedQuantity, stockQuantity)
}

function getInitialCart() {
  try {
    const savedCart = window.localStorage.getItem(CART_STORAGE_KEY)

    if (!savedCart) {
      return []
    }

    const parsedCart = JSON.parse(savedCart)

    if (!Array.isArray(parsedCart)) {
      return []
    }

    return parsedCart
      .filter((item) => item && item.id)
      .map((item) => {
        const stockQuantity = getAvailableStock(item)

        return {
          ...item,
          stock_quantity: stockQuantity,
          quantity: limitQuantityToStock(item.quantity, stockQuantity),
        }
      })
      .filter(
        (item) => item.stock_quantity === null || item.stock_quantity > 0,
      )
  } catch {
    return []
  }
}

export function CartProvider({ children }) {
  const [items, setItems] = useState(getInitialCart)

  useEffect(() => {
    window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items))
  }, [items])

  const addItem = useCallback((product, quantityToAdd = 1) => {
    if (!product?.id) {
      return
    }

    const stockQuantity = getAvailableStock(product)

    if (stockQuantity === 0) {
      return
    }

    const safeQuantityToAdd = limitQuantityToStock(
      quantityToAdd,
      stockQuantity,
    )

    setItems((currentItems) => {
      const existingItem = currentItems.find((item) => item.id === product.id)

      if (existingItem) {
        const availableStock =
          stockQuantity ?? getAvailableStock(existingItem)

        return currentItems.map((item) =>
          item.id === product.id
            ? {
                ...item,
                stock_quantity: availableStock,
                quantity: limitQuantityToStock(
                  item.quantity + safeQuantityToAdd,
                  availableStock,
                ),
              }
            : item,
        )
      }

      return [
        ...currentItems,
        {
          id: product.id,
          name: product.name,
          slug: product.slug,
          price: Number(product.display_price ?? product.price ?? 0),
          imagePath: product.cover_image_path || product.image_path || '',
          stock_quantity: stockQuantity,
          quantity: safeQuantityToAdd,
        },
      ]
    })
  }, [])

  const updateQuantity = useCallback((productId, nextQuantity) => {
    setItems((currentItems) =>
      currentItems.map((item) => {
        if (item.id !== productId) {
          return item
        }

        const stockQuantity = getAvailableStock(item)

        return {
          ...item,
          quantity: limitQuantityToStock(nextQuantity, stockQuantity),
        }
      }),
    )
  }, [])

  const refreshStock = useCallback((stockItems) => {
    if (!Array.isArray(stockItems)) {
      return
    }

    const stockByProductId = new Map(
      stockItems
        .filter((item) => item?.id)
        .map((item) => [
          item.id,
          {
            stock_quantity: getAvailableStock(item),
            stock_status: item.stock_status,
          },
        ]),
    )

    setItems((currentItems) =>
      currentItems
        .map((item) => {
          const currentStock = stockByProductId.get(item.id)

          if (!currentStock) {
            return {
              ...item,
              stock_quantity: 0,
              stock_status: 'out_of_stock',
            }
          }

          return {
            ...item,
            stock_quantity: currentStock.stock_quantity,
            stock_status: currentStock.stock_status,
            quantity: limitQuantityToStock(
              item.quantity,
              currentStock.stock_quantity,
            ),
          }
        })
        .filter(
          (item) => item.stock_quantity === null || item.stock_quantity > 0,
        ),
    )
  }, [])

  const removeItem = useCallback((productId) => {
    setItems((currentItems) =>
      currentItems.filter((item) => item.id !== productId),
    )
  }, [])

  const clearCart = useCallback(() => {
    setItems([])
  }, [])

  const totalItems = useMemo(
    () =>
      items.reduce(
        (total, item) => total + normalizeQuantity(item.quantity),
        0,
      ),
    [items],
  )

  const totalPrice = useMemo(
    () =>
      items.reduce(
        (total, item) =>
          total + Number(item.price ?? 0) * normalizeQuantity(item.quantity),
        0,
      ),
    [items],
  )

  const value = useMemo(
    () => ({
      items,
      totalItems,
      totalPrice,
      addItem,
      updateQuantity,
      refreshStock,
      removeItem,
      clearCart,
    }),
    [
      items,
      totalItems,
      totalPrice,
      addItem,
      updateQuantity,
      refreshStock,
      removeItem,
      clearCart,
    ],
  )

  return (
    <CartContext.Provider value={value}>
      {children}
    </CartContext.Provider>
  )
}

export function useCart() {
  const context = useContext(CartContext)

  if (!context) {
    throw new Error('useCart must be used inside CartProvider.')
  }

  return context
}