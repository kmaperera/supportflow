export default function FieldError({ id, children }) {
  return <p id={id} role={children ? 'alert' : undefined} className="mt-1 min-w-0 break-words text-sm text-red-700">{children}</p>
}
