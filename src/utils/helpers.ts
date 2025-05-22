/**
 * Trims long words in a text to a maximum length
 * @param text The text to process
 * @param maxWordLength Maximum length for any word
 * @returns Processed text with long words trimmed
 */
export function trimLongWords(text: string, maxWordLength: number = 35): string {
  return text.split(' ').map(word => {
    if (word.length > maxWordLength) {
      return word.slice(0, maxWordLength) + '...';
    }
    return word;
  }).join(' ');
}