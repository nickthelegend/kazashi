import wallless from './wallless.mjs';

export default async function run(ctx) {
  return wallless(ctx, { glasses: true });
}
