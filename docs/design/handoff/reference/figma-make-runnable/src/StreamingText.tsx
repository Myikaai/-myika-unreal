/*
 * Streaming Text Component
 *
 * Shows text appearing with a natural fade-in effect.
 * Recent words fade in over ~80ms, never appearing instantly.
 *
 * Cursor blinks naturally at the end of the stream.
 *
 * Opacity gradient:
 * - Oldest words: 100% opacity (solid)
 * - Recent words: 80% opacity
 * - Newest word: 60% opacity (mid-fade)
 */

import './StreamingText.css';

interface StreamingTextProps {
  text: string;
}

export function StreamingText({ text }: StreamingTextProps) {
  const words = text.split(' ');
  const totalWords = words.length;

  return (
    <span className="streaming-text">
      {words.map((word, index) => {
        const isNewest = index === totalWords - 1;
        const isSecondNewest = index === totalWords - 2;

        let opacityClass = '';
        if (isNewest) {
          opacityClass = 'streaming-text__word--newest';
        } else if (isSecondNewest) {
          opacityClass = 'streaming-text__word--recent';
        }

        return (
          <span key={index} className={`streaming-text__word ${opacityClass}`}>
            {word}{' '}
          </span>
        );
      })}
      <span className="streaming-text__cursor" />
    </span>
  );
}
