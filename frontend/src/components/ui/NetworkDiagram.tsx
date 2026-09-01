import React from 'react';
import styles from './NetworkDiagram.module.css';

interface NetworkDiagramProps {
  variant?: 'radial' | 'flow';
  className?: string;
}

export const NetworkDiagram: React.FC<NetworkDiagramProps> = ({ variant = 'radial', className = '' }) => {
  if (variant === 'radial') {
    // ----------------------------------------------------
    // RADIAL LAYOUT
    // ----------------------------------------------------
    return (
      <div className={`${styles.container} ${className}`}>
        <svg viewBox="0 0 600 400" className={styles.svg}>
          <defs>
            <filter id="radial-glow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="0" stdDeviation="6" floodColor="#4F6EF7" floodOpacity="0.4" />
            </filter>
          </defs>

          {/* Dotted Connections flowing from Left to Center */}
          <path d="M 120,90 Q 210,130 270,185" className={`${styles.flowLine} ${styles.flowIn}`} />
          <path d="M 90,200 L 270,200" className={`${styles.flowLine} ${styles.flowIn}`} />
          <path d="M 120,310 Q 210,270 270,215" className={`${styles.flowLine} ${styles.flowIn}`} />

          {/* Dotted Connections flowing from Center to Right */}
          <path d="M 330,185 Q 390,130 480,90" className={`${styles.flowLine} ${styles.flowOut}`} />
          <path d="M 330,200 L 510,200" className={`${styles.flowLine} ${styles.flowOut}`} />
          <path d="M 330,215 Q 390,270 480,310" className={`${styles.flowLine} ${styles.flowOut}`} />

          {/* Skills Nodes (Left) */}
          <g>
            <circle cx="120" cy="90" r="8" className={styles.nodeSkill} />
            <text x="105" y="94" textAnchor="end" className={styles.labelNode}>Python</text>
          </g>
          <g>
            <circle cx="90" cy="200" r="8" className={styles.nodeSkill} />
            <text x="75" y="204" textAnchor="end" className={styles.labelNode}>React & TS</text>
          </g>
          <g>
            <circle cx="120" cy="310" r="8" className={styles.nodeSkill} />
            <text x="105" y="314" textAnchor="end" className={styles.labelNode}>Communications</text>
          </g>

          {/* Matching Career Nodes (Right) */}
          <g>
            <circle cx="480" cy="90" r="8" className={styles.nodeRole} />
            <text x="495" y="94" textAnchor="start" className={styles.labelNode}>AI/ML Engineer <tspan className={styles.percentText}>— 86%</tspan></text>
          </g>
          <g>
            <circle cx="510" cy="200" r="8" className={styles.nodeRole} />
            <text x="525" y="204" textAnchor="start" className={styles.labelNode}>Full Stack Developer <tspan className={styles.percentText}>— 78%</tspan></text>
          </g>
          <g>
            <circle cx="480" cy="310" r="8" className={styles.nodeRole} />
            <text x="495" y="314" textAnchor="start" className={styles.labelNode}>DevOps Specialist <tspan className={styles.percentText}>— 71%</tspan></text>
          </g>

          {/* Central Node (YOU) */}
          <g>
            <circle cx="300" cy="200" r="32" className={styles.nodeCenter} filter="url(#radial-glow)" />
            <text x="300" y="205" textAnchor="middle" className={styles.textCenter}>YOU</text>
          </g>
        </svg>
      </div>
    );
  } else {
    // ----------------------------------------------------
    // FLOW LAYOUT (Skills -> Strengths -> Gaps -> Potential)
    // ----------------------------------------------------
    return (
      <div className={`${styles.container} ${className}`}>
        <svg viewBox="0 0 600 300" className={styles.svg}>
          <defs>
            <filter id="flow-glow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="0" stdDeviation="6" floodColor="#4F6EF7" floodOpacity="0.4" />
            </filter>
          </defs>

          {/* Flow Lines Left -> Middle */}
          <path d="M 120,60 Q 210,100 270,135" className={`${styles.flowLine} ${styles.flowIn}`} />
          <path d="M 90,150 L 270,150" className={`${styles.flowLine} ${styles.flowIn}`} />
          <path d="M 120,240 Q 210,200 270,165" className={`${styles.flowLine} ${styles.flowIn}`} />

          {/* Flow Line Middle -> Right */}
          <path d="M 330,150 L 470,150" className={`${styles.flowLine} ${styles.flowOut}`} />

          {/* Left Feed Nodes */}
          <g>
            <circle cx="120" cy="60" r="8" className={styles.nodeSkill} />
            <text x="105" y="64" textAnchor="end" className={styles.labelNode}>Skills</text>
          </g>
          <g>
            <circle cx="90" cy="150" r="8" className={styles.nodeSkill} />
            <text x="75" y="154" textAnchor="end" className={styles.labelNode}>Strengths</text>
          </g>
          <g>
            <circle cx="120" cy="240" r="8" className={styles.nodeSkill} />
            <text x="105" y="244" textAnchor="end" className={styles.labelNode}>Gaps</text>
          </g>

          {/* Funnel Center Node (AUDIT) */}
          <g>
            <circle cx="300" cy="150" r="30" className={styles.nodeCenter} filter="url(#flow-glow)" />
            <text x="300" y="154" textAnchor="middle" className={styles.textCenter}>AUDIT</text>
          </g>

          {/* Right Potential Node */}
          <g>
            <circle cx="500" cy="150" r="38" className={styles.nodeEnd} filter="url(#flow-glow)" />
            <text x="500" y="154" textAnchor="middle" className={styles.textCenter}>POTENTIAL</text>
          </g>
        </svg>
      </div>
    );
  }
};
