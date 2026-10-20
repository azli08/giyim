# Password reset email setup

Password reset emails are sent through Resend. Configure these backend environment variables before enabling the flow:

```env
RESET_EMAIL_API_KEY=re_your_resend_api_key
RESET_EMAIL_FROM=MODA <no-reply@your-verified-domain.com>
PASSWORD_RESET_URL=https://your-store-domain.com/sifre-yenile.html
```

The sender domain must be verified in Resend. For local development, point `PASSWORD_RESET_URL` at the local frontend URL, such as `http://localhost:5500/sifre-yenile.html`; production requires HTTPS. Keep the API key only in the backend environment, then restart the backend. The reset token expires after 30 minutes, is stored only as a hash, and is single-use. Resetting a password revokes the user's active sessions.
