# Fase 17B: imagen de producción del backend y del worker (mismo código,
# otro comando: dist/main.js o dist/worker.js). Multietapa: se compila con
# todas las dependencias y la imagen final solo lleva dist/ y las de
# producción, sin --watch ni bind mounts. La de desarrollo sigue siendo
# Dockerfile.dev.

# 1) build: dependencias completas, cliente de Prisma y `nest build`.
#    También es la imagen del servicio `migrate` (docker-compose.prod.yml),
#    porque `prisma migrate deploy` y tsx son dependencias de desarrollo.
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
# El schema debe existir antes de `npm ci` porque el postinstall corre `prisma generate`.
COPY prisma ./prisma
COPY prisma.config.ts ./
# DECISIÓN DE PROTOTIPO: igual que en Dockerfile.dev, valor de relleno solo
# para que `prisma generate` resuelva la variable; no se conecta a nada. En
# ejecución lo reemplaza el DATABASE_URL real del entorno.
ENV DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder"
RUN npm ci --no-audit --no-fund
COPY . .
# Se regenera con todo el código ya copiado: el postinstall de `npm ci`
# corrió sin tsconfig.json, y sin él Prisma genera imports con extensión .ts
# que Node no resuelve en dist/.
RUN npx prisma generate && npm run build

# 2) deps-prod: solo dependencias de producción, sin scripts (el postinstall
#    `prisma generate` necesita la CLI; el cliente ya quedó compilado en
#    dist/). Después se borra la CLI de Prisma: el lockfile la marca como
#    "peer opcional" de @prisma/client y npm la instala igual con --omit=dev,
#    arrastrando TypeScript, React (Prisma Studio) y effect, que en ejecución
#    no se usan. El cliente solo necesita @prisma/client/runtime. Así la
#    imagen baja ~200 MB. `npm ls` falla el build si algo de producción
#    queda sin su dependencia.
FROM node:22-alpine AS deps-prod
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund   && rm -rf node_modules/prisma node_modules/@prisma/studio-core node_modules/@prisma/dev      node_modules/typescript node_modules/react node_modules/react-dom node_modules/effect      node_modules/@electric-sql   && ! npm ls --omit=dev --all 2>&1 | grep -E 'missing|invalid' | grep -vE ' (prisma|typescript|react|react-dom|effect|@prisma/studio-core|@prisma/dev|@electric-sql/[a-z-]+)@'

# 3) runtime: la imagen que corre en la beta.
FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=deps-prod /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
# package.json lleva "type": "module" (dist/ es ESM).
COPY package.json ./
# Sin privilegios de root dentro del contenedor.
USER node
EXPOSE 3000
CMD ["node", "dist/main.js"]
