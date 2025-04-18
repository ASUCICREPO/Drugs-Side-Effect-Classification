// /home/zvallarino/AI_AWS_PC/Drugs-Side-Effect-Classification/frontend/src/contexts/RoleContext.jsx
import React, { createContext, useContext, useState } from 'react';

const RoleContext = createContext();

export const RoleProvider = ({ children }) => {
  // Default to 'researchAssistant' or your preferred default
  const [selectedRole, setSelectedRole] = useState('researchAssistant');

  const value = { selectedRole, setSelectedRole };

  return (
    <RoleContext.Provider value={value}>
      {children}
    </RoleContext.Provider>
  );
};

export const useRole = () => {
  const context = useContext(RoleContext);
  if (!context) {
    throw new Error('useRole must be used within a RoleProvider');
  }
  return context;
};