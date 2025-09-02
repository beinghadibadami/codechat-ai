import React, { useState } from 'react';
import { Search, Zap, Bug, BarChart3, Lightbulb, FileCode } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ActionChip {
  id: string;
  label: string;
  icon: React.ElementType;
  description: string;
  disabled?: boolean;
}

const actionChips: ActionChip[] = [
  {
    id: 'summarize',
    label: 'Summarize',
    icon: FileCode,
    description: 'Get an overview of the codebase structure and purpose'
  },
  {
    id: 'tech-stack',
    label: 'Tech Stack',
    icon: BarChart3,
    description: 'Identify technologies, frameworks, and dependencies'
  },
  {
    id: 'find-bugs',
    label: 'Find Bugs',
    icon: Bug,
    description: 'Scan for potential issues and vulnerabilities'
  },
  {
    id: 'analysis',
    label: 'Analysis',
    icon: Search,
    description: 'Deep code analysis with metrics and insights'
  },
  {
    id: 'improvements',
    label: 'Improvements',
    icon: Lightbulb,
    description: 'Suggestions for code optimization and best practices'
  }
];

interface ActionChipsProps {
  onActionSelect: (action: ActionChip) => void;
  disabled?: boolean;
}

export const ActionChips: React.FC<ActionChipsProps> = ({ onActionSelect, disabled = false }) => {
  const [selectedAction, setSelectedAction] = useState<string | null>(null);

  const handleChipClick = (chip: ActionChip) => {
    if (disabled || chip.disabled) return;
    
    setSelectedAction(chip.id);
    onActionSelect(chip);
    
    // Reset selection after a brief moment
    setTimeout(() => setSelectedAction(null), 200);
  };

  return (
    <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
      {actionChips.map((chip) => {
        const IconComponent = chip.icon;
        const isSelected = selectedAction === chip.id;
        const isDisabled = disabled || chip.disabled;
        
        return (
          <Button
            key={chip.id}
            variant="outline"
            size="sm"
            onClick={() => handleChipClick(chip)}
            disabled={isDisabled}
            className={`
              flex-shrink-0 gap-2 transition-all duration-200 group
              ${isSelected ? 'bg-primary text-primary-foreground border-primary' : ''}
              ${!isDisabled ? 'hover:border-primary/50 hover:bg-primary/10' : ''}
              ${isDisabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
            `}
            title={chip.description}
          >
            <IconComponent className={`w-4 h-4 transition-colors ${
              isSelected ? 'text-primary-foreground' : 'text-muted-foreground group-hover:text-primary'
            }`} />
            <span className="font-medium">{chip.label}</span>
          </Button>
        );
      })}
    </div>
  );
};