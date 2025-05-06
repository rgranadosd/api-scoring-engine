// SPDX-FileCopyrightText: 2023 Industria de Diseño Textil S.A. INDITEX
//
// SPDX-License-Identifier: Apache-2.0
const os = require("os");
const fs = require("fs");
const path = require("path");
const fse = require("fs-extra"); // Asegúrate de que fs-extra está instalado (npm install fs-extra)
const { getAppLogger } = require("../log");
const { extractFiles, downloadRepository } = require("../utils/downloadUtils");
const { RepositoryParser } = require("../evaluate/repository/repositoryParser");
const { validateApi } = require("../verify/apiValidation");
const { generateRandomFolder } = require("../verify/lint");

const logger = getAppLogger();

module.exports.execute = async (url, validationType, isVerbose) => {
  // 1) Por defecto hacemos overall si no se indica otro tipo
  validationType = validationType || "OVERALL_SCORE"; // Mantén la lógica original si existe

  let sourceZipFile; // Renombrado para claridad
  let extractedFolderPath = generateRandomFolder(); // Carpeta donde se extrae el zip inicialmente

  try {
    // 2) Manejo de URL (descarga) o posible fichero local (si la lógica original lo permitía)
    // Simplificamos asumiendo que siempre viene una URL por ahora, basado en el curl
    if (typeof url === 'string') { // Asumimos que url es siempre el string de la URL
        sourceZipFile = path.join(os.tmpdir(), `repo-${Date.now()}.zip`);
        logger.info(`Downloading repository from ${url} to ${sourceZipFile}`);
        await downloadRepository(url, sourceZipFile);
    } else {
        // Aquí iría la lógica si aceptaras un fichero subido directamente, como en el código original
        // logger.error("Invalid URL provided for repository download.");
        // throw new Error("Invalid URL provided");
        // Por ahora, asumimos que siempre es una URL string válida
        // Si 'url' puede ser un objeto como en el código original (url.filepath), necesitas ajustar esta parte
         logger.error(`Unexpected type for url: ${typeof url}. Assuming it should be a string URL.`);
         throw new Error("Invalid input type for repository location.");
    }


    // 3) Extraemos el contenido del ZIP
    logger.info(`Extracting files from ${sourceZipFile} to ${extractedFolderPath}`);
    await extractFiles(sourceZipFile, extractedFolderPath);

    // 4) Ajustamos la ruta si hay un único subdirectorio dentro del zip
    // Esto es útil si el zip contiene una carpeta contenedora.
    let contentRootFolder = extractedFolderPath;
    const children = fs.readdirSync(extractedFolderPath);
    if (children.length === 1) {
      const potentialSubdir = path.join(extractedFolderPath, children[0]);
      if (fs.statSync(potentialSubdir).isDirectory()) {
          logger.info(`Detected single subdirectory '${children[0]}', using it as content root.`);
          contentRootFolder = potentialSubdir; // Usamos la subcarpeta como raíz del contenido
      }
    }
    logger.info(`Content root folder identified as: ${contentRootFolder}`);

    // 5) Parseamos la estructura del repositorio (usando el contentRootFolder)
    const repositoryParser = new RepositoryParser(contentRootFolder);
    const parsedRepository = await repositoryParser.parseRepositoryFolder(); // Esto ya tiene logs internos
    const results = []; // Array para guardar los resultados de validación de cada API

    logger.info(`Processing ${parsedRepository.apis.length} valid APIs found by the parser...`);

    // --- Bucle para procesar cada API encontrada y validada por el parser ---
    for (const api of parsedRepository.apis) {
      // Genera una carpeta temporal AISLADA para cada validación de API
      const tempApiValidationFolder = generateRandomFolder();
      logger.info(`   Created temporary folder for API '${api.name || 'Unnamed'}': ${tempApiValidationFolder}`);

      try {
        // 1. Crea la carpeta temporal específica para esta API
        // No es necesario crear subcarpetas aquí, solo la carpeta base.
        fs.mkdirSync(tempApiValidationFolder, { recursive: true });

        // 2. Define la ruta completa al fichero de especificación ORIGINAL (dentro de la carpeta descomprimida)
        // Asegúrate de que api["definition-path"] existe y es un string
        const definitionPath = api["definition-path"];
        if (!definitionPath || typeof definitionPath !== 'string') {
             logger.error(`   Invalid or missing 'definition-path' for API '${api.name || 'Unnamed'}'. Skipping.`);
             // results.push({ error: `Invalid 'definition-path' for ${api.name || 'Unnamed'}` }); // Opcional: añadir error
             continue; // Salta a la siguiente API
        }
        const sourceSpecFile = path.join(contentRootFolder, definitionPath);

        // 3. Define la ruta completa donde se copiará el fichero DENTRO de la carpeta temporal
        // Usamos path.basename para asegurar que solo cogemos el nombre del fichero final
        const destinationSpecFile = path.join(tempApiValidationFolder, path.basename(definitionPath));

        // 4. Comprueba si el fichero de origen existe ANTES de intentar copiar
        if (fs.existsSync(sourceSpecFile)) {
            // --- LOGS DE DEPURACIÓN AÑADIDOS ---
            logger.info(`---> DEBUG: Preparing to copy for API '${api.name || 'Unnamed'}'`);
            logger.info(`     Source Path: ${sourceSpecFile}`);
            logger.info(`     Destination Path: ${destinationSpecFile}`);
            logger.info(`     Source Exists? ${fs.existsSync(sourceSpecFile)}`);
            logger.info(`     Destination Exists? ${fs.existsSync(destinationSpecFile)}`);
            if (fs.existsSync(destinationSpecFile)) {
                try {
                    const destStat = fs.statSync(destinationSpecFile);
                    logger.info(`     Destination Type: ${destStat.isDirectory() ? 'DIRECTORY' : 'FILE'}`);
                } catch (statError) {
                    logger.error(`     Error stating destination ${destinationSpecFile}: ${statError.message}`);
                }
            } else {
                 logger.info(`     Destination does not exist yet.`);
            }
             // --- FIN DE LOGS DE DEPURACIÓN ---

            // 5. Copia el FICHERO original al nuevo destino (fichero a fichero)
            logger.info(`   Copying spec file from ${sourceSpecFile} to ${destinationSpecFile}`);
            fse.copySync(
              sourceSpecFile,
              destinationSpecFile,
              { overwrite: true } // overwrite:true es importante por si acaso
            );

             // 6. Llama a la validación usando la CARPETA temporal que contiene el fichero copiado
             logger.info(`   Calling validateApi for API '${api.name || 'Unnamed'}' in folder ${tempApiValidationFolder}`);
             // Pasamos la carpeta temporal como directorio base para la validación
             const singleResult = await validateApi(tempApiValidationFolder, tempApiValidationFolder, api, validationType);
             results.push(singleResult);
             logger.info(`   Finished validateApi for API '${api.name || 'Unnamed'}'`);

        } else {
             logger.error(`   Spec file not found at source location: ${sourceSpecFile}. Skipping validation for API '${api.name || 'Unnamed'}'.`);
             results.push({ // Añadimos un objeto de error al resultado
                 validationType: "ERROR",
                 apiName: api.name || 'Unnamed',
                 error: `Specification file not found in repository: ${definitionPath}`
             });
        }

      } catch (error) {
          // Captura errores durante la copia o la validación de ESTA API
          logger.error(`   Error processing API entry (Name: ${api.name || 'Unnamed'}, Path: ${api["definition-path"]}): ${error.message}`, error);
          results.push({ // Añadimos un objeto de error al resultado
              validationType: "ERROR",
              apiName: api.name || 'Unnamed',
              definitionPath: api["definition-path"],
              error: `Processing failed: ${error.message}`
          });
      } finally {
        // 7. Limpia la carpeta temporal específica de esta API (si existe)
        if (tempApiValidationFolder && fs.existsSync(tempApiValidationFolder)) {
           logger.info(`   Cleaning up temporary folder: ${tempApiValidationFolder}`);
           try {
              // Usar force: true puede ser útil si hay problemas de permisos a veces, pero usar con cuidado.
              fs.rmSync(tempApiValidationFolder, { recursive: true, force: true });
           } catch (cleanupError) {
              logger.warn(`   Failed to cleanup temporary folder ${tempApiValidationFolder}: ${cleanupError.message}`);
           }
        }
      }
    } // Fin del bucle for

    logger.info("Finished processing all APIs.");

    // 6) Limpieza opcional de resultados si no es modo verbose
    if (!(isVerbose === true || String(isVerbose).toLowerCase() === "true")) {
        logger.info("Verbose mode is off. Cleaning up extra fields from results.");
        // Este bloque parece tener una lógica compleja para limpiar. Asumimos que es correcta.
        // Asegúrate de que 'results' tenga la estructura esperada por este bloque.
        // results es un array de arrays? O un array de objetos?
        // El código original hacía results.push(singleResult), y singleResult viene de validateApi.
        // Supongamos que singleResult es el array de módulos que espera el forEach anidado.
        if (Array.isArray(results)) {
            results.forEach((resultArray) => {
                // Asegurarse que resultArray es un array antes de iterar
                 if(Array.isArray(resultArray)) {
                    resultArray.forEach((moduleObj) => {
                        if (moduleObj && typeof moduleObj === 'object') {
                             Object.keys(moduleObj).forEach((key) => {
                                 if (!["validationType", "rating", "ratingDescription", "score", "error", "apiName"].includes(key)) { // Mantenemos 'error' y 'apiName' si los añadimos
                                     delete moduleObj[key];
                                 }
                             });
                        }
                    });
                 } else if (resultArray && typeof resultArray === 'object' && resultArray.error) {
                     // Si añadimos objetos de error directamente, limpiarlos también si es necesario
                     // O quizás quieras mantener siempre los errores?
                     // Por ahora, este bloque no manejaría los objetos de error que añadimos.
                 }
            });
        }
    } else {
         logger.info("Verbose mode is on. Returning full results.");
    }


    logger.info("Returning final results.");
    return results; // Devuelve el array de resultados

  } catch (error) {
      // Captura errores generales (descarga, extracción inicial, error no capturado en el bucle)
      logger.error(`Unhandled error during validation execute: ${error.message}`, error);
      // Relanza el error para que el middleware errorHandler lo capture y devuelva un 500 adecuado
      throw error;
  } finally {
    // 7) Limpieza final de temporales (zip descargado, carpeta de extracción inicial)
    logger.info("Performing final cleanup of temporary files/folders...");
    if (sourceZipFile && fs.existsSync(sourceZipFile)) {
      try {
          logger.info(`   Deleting downloaded zip: ${sourceZipFile}`);
          fs.unlinkSync(sourceZipFile);
      } catch (unlinkError) {
          logger.warn(`   Failed to delete downloaded zip ${sourceZipFile}: ${unlinkError.message}`);
      }
    }
    // Limpia la carpeta donde se EXTRAJO inicialmente el zip (no las carpetas temporales de cada API, esas ya se limpiaron)
    if (extractedFolderPath && fs.existsSync(extractedFolderPath)) {
      try {
          logger.info(`   Deleting initial extraction folder: ${extractedFolderPath}`);
          fs.rmSync(extractedFolderPath, { recursive: true, force: true });
      } catch (rmError) {
           logger.warn(`   Failed to delete initial extraction folder ${extractedFolderPath}: ${rmError.message}`);
      }
    }
    logger.info("Final cleanup finished.");
  }
};