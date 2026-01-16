const pdfParseNode = require("pdf-parse/node");
console.log("Type of pdfParseNode:", typeof pdfParseNode);
console.log("Keys of pdfParseNode:", Object.keys(pdfParseNode));
if (pdfParseNode.PDFParse) {
  console.log("Type of PDFParse:", typeof pdfParseNode.PDFParse);
}
// Check if it has a default export or is a function
console.log("pdfParseNode instance:", pdfParseNode);
