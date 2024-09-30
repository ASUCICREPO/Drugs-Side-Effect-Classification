// src/Components/SearchBar.js

import React from "react";
import { TextField, IconButton, InputAdornment } from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";

function SearchBar({ value, onChange, onSearch }) {
  return (
    <TextField
      fullWidth
      variant="outlined"
      placeholder="Type your search query..."
      value={value}
      onChange={onChange}
      onKeyPress={(event) => {
        if (event.key === "Enter") {
          onSearch();
        }
      }}
      InputProps={{
        endAdornment: (
          <InputAdornment position="end">
            <IconButton onClick={onSearch} edge="end">
              <SearchIcon />
            </IconButton>
          </InputAdornment>
        ),
      }}
    />
  );
}

export default SearchBar;
