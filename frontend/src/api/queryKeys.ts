import type {
  DashboardParams,
  ID,
  LocationListParams,
  MoveListParams,
  OperationListParams,
  ProductListParams,
  StockListParams,
} from './types'

// Every key starts with its resource root so a mutation can invalidate a whole resource,
// e.g. queryClient.invalidateQueries({ queryKey: qk.stock.all }).
export const qk = {
  me: ['auth', 'me'] as const,
  warehouses: { all: ['warehouses'] as const },
  locations: {
    all: ['locations'] as const,
    list: (p: LocationListParams = {}) => ['locations', 'list', p] as const,
  },
  categories: { all: ['categories'] as const },
  products: {
    all: ['products'] as const,
    list: (p: ProductListParams = {}) => ['products', 'list', p] as const,
  },
  stock: {
    all: ['stock'] as const,
    list: (p: StockListParams = {}) => ['stock', 'list', p] as const,
    locations: (productId: ID) => ['stock', 'locations', productId] as const,
  },
  operations: {
    all: ['operations'] as const,
    list: (p: OperationListParams = {}) => ['operations', 'list', p] as const,
    detail: (id: ID) => ['operations', 'detail', id] as const,
  },
  moves: {
    all: ['moves'] as const,
    list: (p: MoveListParams = {}) => ['moves', 'list', p] as const,
  },
  dashboard: {
    all: ['dashboard'] as const,
    get: (p: DashboardParams = {}) => ['dashboard', p] as const,
  },
}
