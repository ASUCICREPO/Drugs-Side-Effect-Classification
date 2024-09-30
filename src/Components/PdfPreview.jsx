// src/Components/PdfPreview.js

import React, { useState, useEffect } from "react";
import { Typography, Grid } from "@mui/material";
import { ABOUT_US_TEXT_COLOR, TEXT } from "../Utilities/constants";
import { Worker, Viewer, SpecialZoomLevel } from "@react-pdf-viewer/core";
import { searchPlugin } from "@react-pdf-viewer/search";
import "@react-pdf-viewer/core/lib/styles/index.css";
import "@react-pdf-viewer/search/lib/styles/index.css";

function PdfPreview({ uploadedFile, highlightedText }) {
  const searchPluginInstance = searchPlugin({
    keyword: highlightedText ? highlightedText.split(" ") : [],
  });

  const [documentLoad, setDocumentLoad] = useState(false);

  const handleDocumentLoad = () => {
    setDocumentLoad(true);
  };

  useEffect(() => {
    if (documentLoad && highlightedText !== "") {
      console.log(`Highlighted Text: ${highlightedText}`);
    }
  }, [documentLoad, highlightedText]);

  return (
    <Grid item>
      <Typography
        variant="h6"
        sx={{ fontWeight: "bold", color: ABOUT_US_TEXT_COLOR }}
      >
        {TEXT["EN"].FILE_PREVIEW}
      </Typography>
      <Typography
        sx={{ marginBottom: 2, color: ABOUT_US_TEXT_COLOR }}
        variant="subtitle1"
      >
        {uploadedFile.name}
      </Typography>
      <div
        style={{
          border: "1px solid #ccc",
          borderRadius: "4px",
          height: "520px",
          overflow: "auto",
        }}
      >
        <Worker workerUrl="https://unpkg.com/pdfjs-dist@3.4.120/build/pdf.worker.min.js">
          <Viewer
            fileUrl={URL.createObjectURL(uploadedFile)}
            defaultScale={SpecialZoomLevel.PageFit}
            plugins={[searchPluginInstance]}
            onDocumentLoad={handleDocumentLoad}
          />
        </Worker>
      </div>
    </Grid>
  );
}

export default PdfPreview;
