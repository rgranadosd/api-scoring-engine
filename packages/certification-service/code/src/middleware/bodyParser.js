// SPDX-FileCopyrightText: 2023 Industria de Diseño Textil S.A. INDITEX
//
// SPDX-License-Identifier: Apache-2.0


const { koaBody } = require("koa-body");
const { configValue } = require("../config/config");
const { AppError } = require("../utils/error");
const { httpStatusCodes } = require("../utils/httpStatusCodes");

// Exportamos directamente la función middleware configurada de koaBody
module.exports.bodyParser = () => {
  // Configuramos koaBody para que maneje JSON, formularios y multipart
  return koaBody({
      // Habilitar el parseo de multipart/form-data (para subida de ficheros)
      multipart: true,

      // Métodos HTTP en los que se parseará el body
      parsedMethods: ["GET","POST","PUT","PATCH","HEAD","DELETE"], // O los que necesites

      // Límites (leídos desde config)
      formLimit: configValue("service.bodyParser.formLimit"),
      textLimit: configValue("service.bodyParser.textLimit"),
      jsonLimit: configValue("service.bodyParser.jsonLimit"),

      // Opciones específicas para formidable (el parser de multipart)
      formidable: {
          maxFieldsSize: configValue("service.bodyParser.maxFieldsSize"), // Límite tamaño campos texto
          maxFileSize: configValue("service.bodyParser.maxFileSize"), // Límite tamaño fichero individual
          uploadDir: configValue("service.bodyParser.uploadDir"),     // Directorio temporal para subidas
          keepExtensions: true, // Mantiene la extensión original del fichero
      },

      // Manejador de errores si koaBody falla al parsear
      onError: (error, ctx) => { // El manejador recibe (error, ctx)
          // Loguear el error podría ser útil aquí también
          // logger.error("koaBody parsing error:", error);
          ctx.throw(new AppError({ // Usar ctx.throw es más idiomático en Koa
              code: httpStatusCodes.HTTP_UNPROCESSABLE_ENTITY,
              message: `Request body parsing error: ${error.message}`,
              status: httpStatusCodes.HTTP_UNPROCESSABLE_ENTITY,
          }));
      },
  });
};