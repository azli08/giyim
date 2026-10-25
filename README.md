# MODA storefront

## GitHub Pages

The static storefront lives in `frontend/`. A GitHub Actions workflow publishes that directory as the Pages site root, so the home page is served at `https://wafatavil.github.io/giyim/` without moving `index.html` or changing the existing relative links between pages and images.

To enable deployment, open **Settings → Pages** in the GitHub repository and choose **GitHub Actions** as the build and deployment source. Push to `main` or start the **Deploy storefront to GitHub Pages** workflow manually. The deployed pages and bundled product cards are static.

## Backend features

GitHub Pages does not run the Node.js API or PostgreSQL database in `backend/`. Login, registration, admin tools, live catalog data, server cart, saved addresses, and email verification therefore need the backend deployed separately with a production database. Set `window.MODA_API_URL` in `frontend/config.js` to the deployed API's `/api` URL and set the backend's `FRONTEND_ORIGIN` to the Pages origin before enabling those features. Do not commit production secrets to this repository.

For local development, serve `frontend/` with a local static web server and start the backend as described by `backend/package.json`.
