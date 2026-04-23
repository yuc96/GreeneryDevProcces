This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

## MongoDB seed

Idempotent seed for plant/pot/staging catalogs, demo clients, and pricing/labor defaults. Script: [`scripts/db-seed.ts`](scripts/db-seed.ts).

**Required:** `MONGODB_URI` (set in the shell or in `.env`; see `.env.example`).

**Optional:** `MONGODB_DB_NAME` — database name (default `greenery_proposals` if unset).

From the project root:

```bash
export MONGODB_URI="mongodb://localhost:27017"
export MONGODB_DB_NAME="greenery_proposals"
bun run db:seed
```

One-shot:

```bash
MONGODB_URI=mongodb://localhost:27017 npm run db:seed
```

With a custom database name:

```bash
MONGODB_URI=mongodb://localhost:27017 MONGODB_DB_NAME=my_db npm run db:seed
```

Place plant reference PNGs under `public/plants/reference/` using the paths in [`src/data/plant-reference-images.json`](src/data/plant-reference-images.json) so the catalog matches your assets.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
# GreeneryDevProcces
