// src/Components/MainContent.js

import React, { useState } from "react";
import { Box, Typography } from "@mui/material";
import SearchBar from "./SearchBar";
import ResultsList from "./ResultsList";
import { SAMPLE_SEARCH_RESULTS } from "../Utilities/constants";

function MainContent() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [page, setPage] = useState(1);
  const resultsPerPage = 5;

  const handleSearch = () => {
    // Simulate backend search by filtering SAMPLE_SEARCH_RESULTS
    const filteredResults = SAMPLE_SEARCH_RESULTS.filter((item) =>
      item.title.toLowerCase().includes(query.toLowerCase())
    );
    setResults(filteredResults);
    setPage(1); // Reset to first page on new search
  };

  const handlePageChange = (event, value) => {
    setPage(value);
  };

  // Calculate the results to display on the current page
  const paginatedResults = results.slice(
    (page - 1) * resultsPerPage,
    page * resultsPerPage
  );

  const totalPages = Math.ceil(results.length / resultsPerPage);

  return (
    <Box
      sx={{
        padding: "20px",
        height: "100%",
        backgroundColor: "#FFFFFF", // Or use CHAT_BODY_BACKGROUND from constants
        overflowY: "auto",
      }}
    >
      <Typography variant="h4" gutterBottom>
        Population Council Search
      </Typography>
      <SearchBar
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onSearch={handleSearch}
      />
      {results.length > 0 ? (
        <ResultsList
          results={paginatedResults}
          page={page}
          totalPages={totalPages}
          onPageChange={handlePageChange}
        />
      ) : (
        <Typography variant="body1" sx={{ marginTop: 2 }}>
          {results.length === 0 && query
            ? "No results found."
            : "Type a query and press search to find results."}
        </Typography>
      )}
    </Box>
  );
}

export default MainContent;
