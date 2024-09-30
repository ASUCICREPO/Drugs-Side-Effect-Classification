// src/App.js

import React, { useState } from "react";
import "./App.css";
import AppHeader from "./Components/AppHeader";
import LeftNav from "./Components/LeftNav";
import MainContent from "./Components/MainContent";
import { Grid } from "@mui/material";

function App() {
  const [showLeftNav, setShowLeftNav] = useState(true);

  return (
    <div className="App">
      <AppHeader />
      <Grid container sx={{ height: "calc(100vh - 5rem)" }}>
        <Grid
          item
          sx={{
            width: showLeftNav ? '25%' : '60px', // Adjust width when closed
            transition: 'width 0.3s', // Smooth transition
          }}
        >
          <LeftNav showLeftNav={showLeftNav} setLeftNav={setShowLeftNav} />
        </Grid>
        <Grid
          item
          sx={{
            flexGrow: 1,
          }}
        >
          <MainContent />
        </Grid>
      </Grid>
    </div>
  );
}

export default App;
