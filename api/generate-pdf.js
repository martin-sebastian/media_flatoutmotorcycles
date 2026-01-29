/**
 * Vercel serverless function to generate PDF using Adobe PDF Services API v4.
 * Converts HTML content to PDF and returns it for download.
 */

const {
  ServicePrincipalCredentials,
  PDFServices,
  MimeType,
  HTMLToPDFJob,
  HTMLToPDFParams,
  HTMLToPDFResult,
  PageLayout
} = require("@adobe/pdfservices-node-sdk");
const { Readable } = require("stream");

module.exports = async function handler(req, res) {
  // Only allow POST
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { html, filename = "document.pdf" } = req.body;

  if (!html) {
    return res.status(400).json({ error: "HTML content is required" });
  }

  try {
    // Create credentials from environment variables
    const credentials = new ServicePrincipalCredentials({
      clientId: process.env.PDF_SERVICES_CLIENT_ID || process.env.ADOBE_CLIENT_ID,
      clientSecret: process.env.PDF_SERVICES_CLIENT_SECRET || process.env.ADOBE_CLIENT_SECRET
    });

    // Create PDF Services instance
    const pdfServices = new PDFServices({ credentials });

    // Upload HTML as an asset
    const inputAsset = await pdfServices.upload({
      readStream: Readable.from([html]),
      mimeType: MimeType.HTML
    });

    // Set page layout options (Letter size, portrait)
    const pageLayout = new PageLayout({
      pageSize: "LETTER"
    });

    // Create parameters
    const params = new HTMLToPDFParams({
      pageLayout,
      includeHeaderFooter: false
    });

    // Create and submit the job
    const job = new HTMLToPDFJob({ inputAsset, params });
    const pollingURL = await pdfServices.submit({ job });
    const pdfServicesResponse = await pdfServices.getJobResult({
      pollingURL,
      resultType: HTMLToPDFResult
    });

    // Get the PDF content
    const resultAsset = pdfServicesResponse.result.asset;
    const streamAsset = await pdfServices.getContent({ asset: resultAsset });

    // Collect stream into buffer
    const chunks = [];
    for await (const chunk of streamAsset.readStream) {
      chunks.push(chunk);
    }
    const pdfBuffer = Buffer.concat(chunks);

    // Set response headers for PDF download
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Length", pdfBuffer.length);

    return res.send(pdfBuffer);
  } catch (error) {
    console.error("PDF generation error:", error);
    return res.status(500).json({
      error: "PDF generation failed",
      details: error.message
    });
  }
};
