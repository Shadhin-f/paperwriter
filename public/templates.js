// Starter documents, shared by the Node server and the browser (cloud projects).

const ARTICLE = String.raw`\documentclass[11pt]{article}
\usepackage[margin=1in]{geometry}
\usepackage{amsmath,amssymb}
\usepackage{graphicx}
\usepackage[hidelinks]{hyperref}

\title{Untitled Paper}
\author{Your Name}
\date{\today}

\begin{document}
\maketitle

\begin{abstract}
Write a short summary of your work here.
\end{abstract}

\section{Introduction}
Start writing here, or ask your AI co-author for help.

\end{document}
`;

const WELCOME = String.raw`\documentclass[11pt]{article}
\usepackage[margin=1in]{geometry}
\usepackage{amsmath,amssymb}
\usepackage{booktabs}
\usepackage{xcolor}
\usepackage[hidelinks]{hyperref}

\definecolor{lavender}{HTML}{8B7CF6}

\title{\textcolor{lavender}{Hello from PaperWriter}}
\author{You \& your AI co-author}
\date{\today}

\begin{document}
\maketitle

\begin{abstract}
PaperWriter is a cosy LaTeX studio: write on the left, see the PDF on the right,
and chat with Claude, ChatGPT, Gemini or a local model to draft and fix your paper.
\end{abstract}

\section{Getting started}
Press \textbf{Ctrl+S} to save and compile. Select some text and press
\textbf{Ctrl+K} to ask the AI about it. Try asking:
\begin{itemize}
  \item \emph{Turn this into a two-column IEEE paper.}
  \item \emph{Add a table comparing three methods.}
  \item \emph{Fix my compile errors.}
\end{itemize}

\section{A little maths}
The Gaussian integral is a classic:
\begin{equation}
  \int_{-\infty}^{\infty} e^{-x^2}\,dx = \sqrt{\pi}.
  \label{eq:gauss}
\end{equation}
Equation~\eqref{eq:gauss} looks lovely in Computer Modern.

\section{A tidy table}
\begin{table}[h]
  \centering
  \begin{tabular}{lcc}
    \toprule
    Model & Speed & Cuteness \\
    \midrule
    Claude  & fast   & \(\star\star\star\) \\
    Gemini  & fast   & \(\star\star\star\) \\
    Local   & cosy   & \(\star\star\star\) \\
    \bottomrule
  \end{tabular}
  \caption{Every model is welcome here.}
\end{table}

\end{document}
`;

export const TEMPLATES = {
  article: { 'main.tex': ARTICLE },
  welcome: { 'main.tex': WELCOME },
  blank: { 'main.tex': '\\documentclass{article}\n\\begin{document}\n\n\\end{document}\n' },
};
