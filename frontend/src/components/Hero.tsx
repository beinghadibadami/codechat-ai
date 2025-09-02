import React from 'react';
import { CodeIcon } from './CodeIcon';

export const Hero = () => {
  return (
    <div className="relative overflow-hidden">
      {/* Background gradient */}
      <div className="absolute inset-0 bg-gradient-glow opacity-20 blur-3xl -z-10" />
      
      {/* Starry Background Animation */}
      <div className="absolute inset-0 -z-5">
        {[...Array(50)].map((_, i) => (
          <div
            key={i}
            className="absolute w-1 h-1 bg-primary rounded-full opacity-20 animate-pulse"
            style={{
              top: `${Math.random() * 100}%`,
              left: `${Math.random() * 100}%`,
              animationDelay: `${Math.random() * 3}s`,
              animationDuration: `${2 + Math.random() * 3}s`
            }}
          />
        ))}
        {[...Array(20)].map((_, i) => (
          <div
            key={`star-${i}`}
            className="absolute w-0.5 h-0.5 bg-accent-cyan rounded-full opacity-30 animate-pulse"
            style={{
              top: `${Math.random() * 100}%`,
              left: `${Math.random() * 100}%`,
              animationDelay: `${Math.random() * 2}s`,
              animationDuration: `${1.5 + Math.random() * 2}s`
            }}
          />
        ))}
      </div>
      
      <div className="relative text-center space-y-12 py-20">
        {/* Logo and title */}
        <div className="space-y-6">
          <div className="flex justify-center">
            <CodeIcon className="w-16 h-16 animate-float" />
          </div>
          
          <div className="space-y-6">
            <h1 className="text-display bg-gradient-primary bg-clip-text text-transparent animate-fade-in-up">
              CodeChat AI
            </h1>
            <div className="space-y-4">
              {/* <p className="text-2xl md:text-3xl font-semibold text-foreground max-w-4xl mx-auto animate-fade-in-up delay-150">
               
              </p> */}
              <p className="text-lg md:text-xl text-muted-foreground max-w-3xl mx-auto animate-fade-in-up delay-200">
              Transform Any GitHub Repository Into an AI-Powered Guide. Get structured insights, understand code architecture, and contribute with confidence. 
        
              </p>
            </div>
          </div>
        </div>

        {/* 3-Step Process */}
        <div className="max-w-6xl mx-auto animate-fade-in-up delay-300">
          <h2 className="text-2xl md:text-3xl font-bold text-center mb-12 text-foreground">
            Your Journey in Three Simple Steps
          </h2>
          
          <div className="grid md:grid-cols-3 gap-8">
            {/* Step 1 */}
            <div className="glass p-8 rounded-2xl border border-border/50 hover:border-primary/30 transition-all duration-300 group">
              <div className="flex items-center justify-center w-12 h-12 rounded-full bg-primary/10 text-primary font-bold text-xl mb-6 mx-auto group-hover:scale-110 transition-transform duration-300">
                1
              </div>
              <h3 className="text-xl font-semibold text-center mb-4 text-foreground">
                Input & Initialize
              </h3>
              <p className="text-muted-foreground text-center leading-relaxed">
                Simply paste any public GitHub repository URL or upload your code files. 
                Our AI intelligently processes the entire codebase structure.
              </p>
            </div>

            {/* Step 2 */}
            <div className="glass p-8 rounded-2xl border border-border/50 hover:border-primary/30 transition-all duration-300 group">
              <div className="flex items-center justify-center w-12 h-12 rounded-full bg-accent-cyan/10 text-accent-cyan font-bold text-xl mb-6 mx-auto group-hover:scale-110 transition-transform duration-300">
                2
              </div>
              <h3 className="text-xl font-semibold text-center mb-4 text-foreground">
                AI Analysis
              </h3>
              <p className="text-muted-foreground text-center leading-relaxed">
                Our advanced AI engine dives deep, analyzing structure, dependencies, 
                patterns, and core logic to understand your project completely.
              </p>
            </div>

            {/* Step 3 */}
            <div className="glass p-8 rounded-2xl border border-border/50 hover:border-primary/30 transition-all duration-300 group">
              <div className="flex items-center justify-center w-12 h-12 rounded-full bg-success/10 text-success font-bold text-xl mb-6 mx-auto group-hover:scale-110 transition-transform duration-300">
                3
              </div>
              <h3 className="text-xl font-semibold text-center mb-4 text-foreground">
                Get Instant Insights
              </h3>
              <p className="text-muted-foreground text-center leading-relaxed">
                Receive clear, actionable insights tailored for quick understanding, 
                code navigation, and confident contributions to any project.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};