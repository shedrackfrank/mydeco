import { useState } from 'react'
import Icon from './Icon'

// Reusable across every password field in the app (signup, login,
// reset password) so the show/hide behavior stays identical
// everywhere instead of being reimplemented per page. Accepts the
// same props a plain <input> would -- value, onChange, id, etc. --
// and just adds the toggle on top.
function PasswordInput({ id, value, onChange, required, autoComplete, placeholder, disabled }) {
  const [visible, setVisible] = useState(false)

  return (
    <div className="password-input-wrapper">
      <input
        id={id}
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={onChange}
        required={required}
        autoComplete={autoComplete}
        placeholder={placeholder}
        disabled={disabled}
      />
      <button
        type="button"
        className="password-toggle"
        onClick={() => setVisible((prev) => !prev)}
        aria-label={visible ? 'Hide password' : 'Show password'}
        disabled={disabled}
      >
        <Icon name={visible ? 'ti-eye-off' : 'ti-eye'} />
      </button>
    </div>
  )
}

export default PasswordInput