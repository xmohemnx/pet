import { loadIdentity } from '../../lib/server-identity';
import { loadApi } from '../../lib/platform-server';
import { Marketplace } from '../../components/marketplace';
import type { Product, CustomerOrder, DeliveryAddress } from '@petra/contracts';
export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'متاجر العيادات',
  robots: { index: false, follow: false },
};
export default async function Page() {
  const me = await loadIdentity();
  const [products, orders, cart, wishlist, addresses] = await Promise.all([
    loadApi<Product[]>('marketplace'),
    loadApi<CustomerOrder[]>('me/orders'),
    loadApi<{ product_id: string; quantity: number }[]>('me/cart'),
    loadApi<string[]>('me/wishlist'),
    loadApi<DeliveryAddress[]>('me/delivery-addresses'),
  ]);
  return (
    <Marketplace
      me={me}
      products={products}
      initialOrders={orders}
      initialCart={cart}
      initialWishlist={wishlist}
      initialAddresses={addresses}
    />
  );
}
