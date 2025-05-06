// SPDX-FileCopyrightText: 2023 Industria de Diseño Textil S.A. INDITEX
//
// SPDX-License-Identifier: Apache-2.0


const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");
const { checkFileExists } = require("../../utils/fileUtils");
const { getAppLogger } = require("../../log");
const { AppError } = require("../../utils/error");
const { httpStatusCodes } = require("../../utils/httpStatusCodes");
const { REST, EVENT, GRPC, GRAPHQL } = require("../lint/protocols");

const logger = getAppLogger();
const protocols = [REST, EVENT, GRPC, GRAPHQL]; // Lista de protocolos soportados

class RepositoryParser {
  folder;

  constructor(folder) {
    this.folder = folder;
  }

  async parseRepositoryFolder() {
    logger.info(`-> Starting repository parsing for folder: ${this.folder}`);

    let parsedData;
    try {
      // Paso 1: Identificar APIs (principalmente leyendo metadata.yml)
      parsedData = await this.identifyAPIs(); // Contiene { rootFolder: ..., apis: [...] }

      // Paso 2: Añadir ficheros Markdown por defecto (README.md)
      parsedData.markdowns = [];
      logger.info("   Looking for default markdown files (README.md)...");
      parsedData.markdowns.push.apply(parsedData.markdowns, await RepositoryParser.addDefaultMarkdowns(this.folder));
      logger.info(`   Found ${parsedData.markdowns.length} default markdown files.`);

      // Paso 3: Registrar cuántas APIs se encontraron ANTES de filtrar
      const initialApiCount = parsedData.apis.length;
      logger.info(`   Found ${initialApiCount} API entries listed in metadata initially.`);

      // Paso 4: Filtrar APIs según 'api-spec-type'
      logger.info("   Filtering APIs based on 'api-spec-type' (must be valid and supported)...");
      parsedData.apis = parsedData.apis.filter((x, index) => { // Añadimos index para logging si falta nombre
        const apiSpecType = x ? x["api-spec-type"] : undefined; // Comprobación extra por si 'x' fuera null/undefined

        if (apiSpecType && typeof apiSpecType === 'string') {
          // Caso válido: el tipo existe y es texto
          const upperCaseType = apiSpecType.toUpperCase();
          if (protocols.includes(upperCaseType)) {
            // El tipo es válido y está en la lista de protocolos soportados
            // logger.info(`      Keeping API entry ${index + 1} ('${x.name || 'Unnamed'}') - Type: ${apiSpecType}`); // Log opcional por cada API válida
            return true; // Mantenemos esta API
          } else {
            // El tipo existe pero no es uno de los soportados
            const apiName = x.name || `Entry ${index + 1}`; // Usa el índice si no hay nombre
            logger.warn(`      Skipping API entry '${apiName}': Unsupported 'api-spec-type' (${apiSpecType}).`);
            return false; // Filtramos esta API
          }
        } else {
          // Caso inválido: el tipo falta o no es texto
          const apiName = x ? (x.name || `Entry ${index + 1}`) : `Entry ${index + 1}`; // Usa el índice si no hay nombre o si x es null
          logger.warn(`      Skipping API entry '${apiName}': Missing or invalid 'api-spec-type' (value: ${apiSpecType}).`);
          return false; // Filtramos esta API
        }
      });

      // Paso 5: Registrar cuántas APIs quedaron DESPUÉS de filtrar
      const finalApiCount = parsedData.apis.length;
      if (finalApiCount > 0) {
           logger.info(`   Finished filtering. ${finalApiCount} valid APIs remain: ` + parsedData.apis.map((api) => `'${api.name || 'Unnamed'}/${api["api-spec-type"]}'`).join(", "));
      } else {
           logger.warn("   Finished filtering. 0 valid APIs remain after checking 'api-spec-type'."); // Usamos WARN si se filtraron todas
      }

    } catch (error) {
        // Si ocurre un error durante la identificación/parseo, registrarlo y relanzarlo
        logger.error(`<- Error during repository parsing: ${error.message}`, error);
        // Asegúrate de que el error sea una instancia de AppError o envuélvelo si no lo es
        if (error instanceof AppError) {
            throw error;
        } else {
            throw new AppError({
               code: httpStatusCodes.HTTP_INTERNAL_SERVER_ERROR,
               message: `Internal error during repository parsing: ${error.message}`,
               status: httpStatusCodes.HTTP_INTERNAL_SERVER_ERROR,
            });
        }
    }

    logger.info(`<- Finished repository parsing successfully for folder: ${this.folder}`);
    return parsedData; // Devuelve las APIs válidas y los markdowns
  }

  async identifyAPIs() {
    logger.info(`   -> Identifying APIs in folder: ${this.folder}`);
    let parsedData = {
      rootFolder: this.folder,
      apis: [], // Inicializa como array vacío
    };

    const metadataPath = path.join(this.folder, "metadata.yml");
    logger.info(`      Checking for metadata file at: ${metadataPath}`);

    if (await checkFileExists(metadataPath)) {
       logger.info("      Found metadata.yml. Attempting to load APIs from it.");
       try {
           parsedData.apis = await this.loadAPIsFromMetadata(metadataPath);
           logger.info(`      Successfully loaded ${parsedData.apis.length} API entries from metadata.yml.`);
       } catch (error) {
           // El error ya se loguea en loadMetadata, aquí solo informamos que falló la carga
           logger.error(`      Failed to load or parse APIs from metadata.yml. Proceeding with 0 APIs from metadata.`);
           parsedData.apis = []; // Aseguramos que apis sea un array vacío si falla la carga
           // Podríamos decidir relanzar el error si la metadata es crucial
           // throw error;
       }
    } else {
       logger.warn("      metadata.yml not found in the root folder. No APIs will be loaded from metadata.");
    }

    logger.info(`   <- Finished identifying APIs. Found ${parsedData.apis.length} APIs initially.`);
    return parsedData;
  }

  async loadAPIsFromMetadata(metadataPath) {
    logger.info(`      -> Loading and parsing metadata file: ${metadataPath}`);
    let metadata = await this.loadMetadata(metadataPath); // loadMetadata ya maneja logs de error
    let apis = [];

    if (metadata && Array.isArray(metadata.apis)) {
        logger.info(`         Found 'apis' array in metadata. Processing ${metadata.apis.length} entries.`);
        for (const [index, api] of metadata.apis.entries()) { // Usamos entries para tener índice
            if (api && typeof api === 'object') {
                 apis.push(api);
            } else {
                 logger.warn(`         Skipping invalid entry #${index + 1} in metadata.apis (not an object): ${JSON.stringify(api)}`);
            }
        }
    } else {
         logger.warn(`         'apis' field missing, empty, or not an array in ${metadataPath}. No APIs loaded from this file.`);
         // Aseguramos devolver un array vacío aunque 'apis' no exista o no sea array
         apis = [];
    }
    logger.info(`      <- Finished loading from metadata file. Extracted ${apis.length} API objects.`);
    return apis;
  }

  async loadMetadata(pathToFile) {
    // (Este método ya tenía buen logging de errores, lo mantenemos)
    try {
        const data = await fs.promises.readFile(pathToFile, 'utf-8');
        const loadedYaml = yaml.load(data);
        return loadedYaml || {};
    } catch (error) {
        if (error instanceof yaml.YAMLException) {
             logger.error(`         Error parsing YAML file at ${pathToFile}: ${error.message}`);
             throw new AppError({
               code: httpStatusCodes.HTTP_UNPROCESSABLE_ENTITY,
               message: `Cannot parse metadata.yml: ${error.message}`,
               status: httpStatusCodes.HTTP_UNPROCESSABLE_ENTITY,
             });
        } else if (error.code === 'ENOENT') {
             logger.error(`         Metadata file not found at ${pathToFile}`);
             throw new AppError({
               code: httpStatusCodes.HTTP_NOT_FOUND,
               message: "metadata.yml not found",
               status: httpStatusCodes.HTTP_NOT_FOUND,
             });
        } else {
             logger.error(`         Cannot read metadata file at ${pathToFile}: ${error.message}`);
             throw new AppError({
               code: httpStatusCodes.HTTP_INTERNAL_SERVER_ERROR,
               message: "Cannot read metadata.yml repository",
               status: httpStatusCodes.HTTP_INTERNAL_SERVER_ERROR,
             });
        }
    }
  }

  // --- Métodos estáticos para Markdowns (sin cambios) ---
  static async addDefaultMarkdowns(folder) {
    const markdowns = [];
    markdowns.push.apply(markdowns, await RepositoryParser.addMarkdownFile(folder, "README.md"));
    return markdowns;
  }

  static async addMarkdownFile(folder, fileName) {
    const markdown = [];
    let filePath = path.join(folder, fileName);
    if (await checkFileExists(filePath)) {
      logger.info(`      Found markdown file: ${filePath}`);
      markdown.push(filePath);
    } else {
      // logger.info(`      Markdown file not found: ${filePath}`); // Opcional: log si no se encuentra
    }
    return markdown;
  }
}

module.exports = { RepositoryParser };
