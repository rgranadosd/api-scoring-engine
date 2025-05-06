// SPDX-License-Identifier: Apache-2.0

const fs = require("fs");
const path = require("path");
const os = require("os");
const axios = require("axios");
const extract = require("extract-zip");
const { pipeline } = require("stream");
const { promisify } = require("util");

const pipelineAsync = promisify(pipeline);

/**
 * Descarga un ZIP desde `url` y lo guarda en `destPath`.
 */
async function downloadRepository(url, destPath) {
  // validamos URL
  new URL(url); // lanzará si no es URL válida
  const response = await axios.get(url, { responseType: "stream" });
  await pipelineAsync(response.data, fs.createWriteStream(destPath));
}

/**
 * Extrae el ZIP `zipPath` en la carpeta `outDir`.
 */
async function extractFiles(zipPath, outDir) {
  await extract(zipPath, { dir: outDir });
}

module.exports = { downloadRepository, extractFiles };
