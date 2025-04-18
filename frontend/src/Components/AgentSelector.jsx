// src/components/AgentSelector.jsx
import React, { useState } from "react";
import { Grid, Typography, Box } from "@mui/material";

function AgentSelector() {
  // State to track which agent is selected (default to Legal Agent)
  const [selectedAgent, setSelectedAgent] = useState("Legal Agent");
  
  // List of available agents
  const agents = ["Research Expert", "Computer Science Agent", "Legal Agent", "Communication Agent"];
  
  // Handle agent selection
  const handleAgentSelect = (agent) => {
    setSelectedAgent(agent);
  };

  return (
    <Grid item>
      <Typography variant="h6" sx={{ fontWeight: "bold", color: "#FFFFFF", marginBottom: "0.5rem" }}>
        Who's Answering
      </Typography>
      <Box sx={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        {agents.map((agent) => (
          <Box 
            key={agent}
            sx={{
              display: "flex",
              alignItems: "center",
              cursor: "pointer",
            }}
            onClick={() => handleAgentSelect(agent)}
          >
            {/* Circular checkbox */}
            <Box 
              sx={{
                width: "20px",
                height: "20px",
                borderRadius: "50%",
                border: "2px solid white",
                backgroundColor: selectedAgent === agent ? "#6BC049" : "transparent",
                marginRight: "8px",
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
              }}
            />
            <Typography 
              variant="body2" 
              sx={{ 
                color: "#FFFFFF",
                fontWeight: selectedAgent === agent ? "bold" : "normal"
              }}
            >
              {agent}
            </Typography>
          </Box>
        ))}
      </Box>
    </Grid>
  );
}

export default AgentSelector;