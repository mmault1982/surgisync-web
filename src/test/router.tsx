import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { render } from '@testing-library/react';
import type { ReactNode } from 'react';

/**
 * Render a component that contains a `<Link>`, without the real route tree.
 *
 * Most screens in this app are props-only and render bare — that is the split
 * every route file makes, and it is why these tests need no router. A table
 * whose first cell is a real anchor is the exception: `<Link>` reads the
 * router from context and throws without one.
 *
 * The anchor is not decoration and is not replaceable by the row's click
 * handler. It is the keyboard path (a tabbable `<tr>` would make every row a
 * tab stop and wreck the table's row/gridcell semantics), it gives cmd-click
 * and "open in new tab", and it is what `defaultPreload: 'intent'` prefetches
 * from. Dropping it to keep the test simple would be trading an accessibility
 * affordance for a fixture.
 *
 * Deliberately a *stub* tree rather than the generated one. Importing
 * `routeTree.gen.ts` would pull every route's loader, its auth guard and its
 * data fetching into a test about a table — and that file is not committed, so
 * it would also make these tests depend on a codegen step. The paths here need
 * only match the `to` values under test; what is asserted is that the anchor
 * carries the right href.
 */
const LINKED_PATHS = [
  '/inventory/product-catalog',
  '/inventory/product-catalog/new',
  '/inventory/product-catalog/$partId',
  '/inventory/product-catalog/$partId/edit',
  '/inventory/on-hand',
  '/inventory/on-hand/$stockItemId',
];

export function renderWithRouter(ui: ReactNode) {
  const rootRoute = createRootRoute();

  const routes = [
    createRoute({ getParentRoute: () => rootRoute, path: '/', component: () => <>{ui}</> }),
    ...LINKED_PATHS.map((path) =>
      createRoute({ getParentRoute: () => rootRoute, path, component: () => null }),
    ),
  ];

  const router = createRouter({
    routeTree: rootRoute.addChildren(routes),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  });

  // The stub tree is not the registered one, so its types do not line up with
  // the module augmentation `routeTree.gen.ts` installs. That mismatch is the
  // point of the stub, not a defect in it.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return render(<RouterProvider router={router as any} />);
}
