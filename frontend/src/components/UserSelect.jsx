export default function UserSelect({ users, value, onChange, error }) {
  return (
    <div className="field">
      <label htmlFor="user">User</label>
      <select id="user" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Select a user...</option>
        {users.map((u) => (
          <option key={u.user_id} value={u.user_id}>
            #{u.user_id} - {u.full_name} ({u.email})
          </option>
        ))}
      </select>
      {error && <span className="field-error">{error}</span>}
    </div>
  );
}
