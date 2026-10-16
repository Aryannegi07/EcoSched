/** An empty list is an invitation: say what is missing and give the next action. */
export default function Empty({ children, action }) {
  return (
    <div className="state empty">
      <p>{children}</p>
      {action}
    </div>
  );
}
