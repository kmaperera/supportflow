// Padding belongs to the role shell, so nested page content never doubles it.
export default function PageContainer({ id, children }) {
  return <main id={id} tabIndex={-1} className="mx-auto w-full min-w-0 p-4 sm:p-6 lg:p-8">{children}</main>
}
