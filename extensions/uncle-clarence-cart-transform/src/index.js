export * from './cart_transform_run';
export default function run(input) {
  const hasBundleLines = input.cart.lines.some(
    l => (l.attributes || []).some(a => a.key === 'ucbbq_bundle_context')
  );
  return {
    operations: [],
    debug: hasBundleLines ? "ucbbq bundle context detected" : "no bundle context"
  };
}