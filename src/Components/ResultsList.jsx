// src/Components/ResultsList.js

import React from "react";
import {
  List,
  ListItem,
  ListItemText,
  Link,
  Pagination,
  Typography,
} from "@mui/material";

function ResultsList({ results, page, totalPages, onPageChange }) {
  return (
    <div>
      <List>
        {results.map((result, index) => (
          <ListItem key={index} alignItems="flex-start">
            <ListItemText
              primary={
                <Link href={result.link} target="_blank" rel="noopener">
                  {result.title}
                </Link>
              }
              secondary={
                <Typography variant="body2" color="textSecondary">
                  {result.description}
                </Typography>
              }
            />
          </ListItem>
        ))}
      </List>
      <Pagination
        count={totalPages}
        page={page}
        onChange={onPageChange}
        color="primary"
        sx={{ display: "flex", justifyContent: "center", marginTop: 2 }}
      />
    </div>
  );
}

export default ResultsList;
