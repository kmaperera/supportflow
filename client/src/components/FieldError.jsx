export default function FieldError({ id, children }) {
  // The invalid field describes this message when focused. Form-level failures
  // remain alerts; multiple invalid fields must not all interrupt at once.
  return <p id={id} className="mt-1 min-w-0 break-words text-sm text-red-700 dark:text-red-300">{children}</p>
}
