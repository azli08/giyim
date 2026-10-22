# Account verification and password reset email setup

The app sends account verification and password reset emails through Resend. To use it:

1. Create a Resend account and add a sending domain you control.
2. Add the DNS records Resend provides, then wait until the domain is verified.
3. Create an API key with sending access.
4. Add the following values to `backend/.env` (replace the example domain with your real domain):

```env
RESET_EMAIL_API_KEY=re_your_resend_api_key
RESET_EMAIL_FROM=MODA <no-reply@your-verified-domain.com>
PASSWORD_RESET_URL=https://your-store-domain.com/sifre-yenile.html
EMAIL_VERIFICATION_URL=https://your-store-domain.com/email-dogrula.html
```

The sender address must use the verified domain. For local development before you own a domain, use Resend's test sender `MODA <onboarding@resend.dev>`. Resend only allows this test sender to deliver to your own Resend account email or its test addresses; signup tests should use the email address associated with the Resend account. Switch to a sender on your verified domain before accepting registrations from other people.

For local development, point the two page URLs at the local frontend, for example `http://localhost:5500/sifre-yenile.html` and `http://localhost:5500/email-dogrula.html`. Production URLs must use HTTPS.

Keep the API key only in the backend environment; do not put it in frontend files or commit it. Restart the backend after changing `.env`. On startup, the app runs the migrations, including the email verification table. New users can sign in without verifying their address; registration succeeds even if the verification email cannot be sent. Verification is required to request a password reset and to continue through the checkout address step. Accounts that existed before this migration remain verified so they are not locked out.

Password reset links expire after 30 minutes; verification links expire after 24 hours. Both tokens are stored only as hashes and can be used once. Resetting a password revokes the user's active sessions.
