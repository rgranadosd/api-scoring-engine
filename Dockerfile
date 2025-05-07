# Usa una imagen base oficial de Node.js LTS
FROM node:20-bullseye

# Establece el directorio de trabajo dentro del contenedor
WORKDIR /app

# Copia los archivos package.json y package-lock.json del servicio
COPY packages/certification-service/code/package*.json ./packages/certification-service/code/

# Copia scripts y reglas personalizadas
COPY packages/certification-service/code/scripts/ ./packages/certification-service/code/scripts/
COPY packages/certification-service/code/protolint_custom_rules/ ./packages/certification-service/code/protolint_custom_rules/

# Copia el directorio de configuración
COPY config/ ./config/

# Instala las dependencias
WORKDIR /app/packages/certification-service/code/
RUN npm install

# Vuelve a la raíz del proyecto y copia todo el código restante
WORKDIR /app
COPY . .

# Expón el puerto 8080 (interno del contenedor)
EXPOSE 8080

# Comando para lanzar la aplicación
CMD ["node", "packages/certification-service/code/src/main.js"]