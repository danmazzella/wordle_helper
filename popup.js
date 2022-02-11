const getGameState = () => localStorage['nyt-wordle-state'];

// Remove the last guess from the page
const removeLastGuess = (newState) => {
  // Find out what the row was
  const { rowIndex } = newState;
  // Save the new state on the site
  localStorage.setItem('nyt-wordle-state', JSON.stringify(newState));
  // Get the game board
  const gameBoard = document.querySelector('body > game-app').shadowRoot.querySelector('#board');
  // Get the current row
  const row = gameBoard.childNodes.item(rowIndex);
  // Remove all the letters from the row
  row.setAttribute('letters', '');
  // Reload the page
  window.location.reload();
};

// Show the possibilities in the popup
const renderPossibilityList = (ul, element) => {
  const li = document.createElement('li');
  li.setAttribute('class', 'item');
  ul.appendChild(li);
  li.innerHTML += element;
};

const retrieveGameState = tab => new Promise(async (resolve) => {
  // Get the gameState for getting guesses and solution
  const gameStateStr = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    function: getGameState,
  });

  // Convert gameState to JSON
  const gameState = JSON.parse(gameStateStr[0].result);

  return resolve(gameState);
});

const removeLastGuessFunc = (tab, newGameState) => new Promise(async (resolve) => {
  // Set the gameState to newGameState
  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    function: removeLastGuess,
    args: [newGameState],
  });

  return resolve();
});

const getGreenYellowGrey = (gameState) => {
  // Keep array of all yellow/green letters
  let allLettersInWord = [];

  // When we find a letter that works, put it here so we know which position it goes to
  const greenLetters = {
    0: undefined,
    1: undefined,
    2: undefined,
    3: undefined,
    4: undefined,
  };
  // Will be list of all yellow letters and what position they CANNOT exist in
  const yellowLetters = {
    0: [],
    1: [],
    2: [],
    3: [],
    4: [],
  };
  // All letters that do not exist in solution
  const greyLetters = [];
  // Get solution from gameState
  const { solution } = gameState;

  // Split the solution into array of letters
  const solutionSplit = solution.split('');

  // Go through each already existing guess
  Object.keys(gameState.boardState).forEach((guessIdx) => {
    const guess = gameState.boardState[guessIdx];

    if (guess !== '') {
      // Split guess into array of characters
      const guessSplit = guess.split('');

      // All letters in this word that are both green and/or yellow
      const goodLetters = [];

      // For each letter in the guess, we will compare it with every letter in the solution
      Object.keys(guessSplit).forEach((letterIdx) => {
        // This is the current letter in guess
        const guessLtr = guessSplit[letterIdx];

        // Where the guessed letter appears in the solution
        const letterExistInWordIdx = solutionSplit.findIndex(solutionLtr => guessLtr === solutionLtr);

        if (solutionSplit[letterIdx] === guessLtr) {
          // The letter is a green letter, add to greenLetters
          greenLetters[letterIdx] = guessLtr;
          goodLetters.push(guessLtr);
        } else if (letterExistInWordIdx === -1) {
          // The letter does not exist at all in solution, add to greyLetters
          greyLetters.push(guessLtr);
        } else {
          // The letter is a yellow letter, add to yellowLetters
          yellowLetters[letterIdx].push(guessLtr);
          goodLetters.push(guessLtr);
        }
      });

      // Take all the letters not in the current guess, and add them to "goodLetters" and overwrite allLetters with new arr
      const notInAllLetters = allLettersInWord.filter(ltr => !goodLetters.includes(ltr));
      allLettersInWord = goodLetters.concat(notInAllLetters);
    }
  });

  return {
    greenLetters, yellowLetters, greyLetters, allLettersInWord,
  };
};

// Function to make sure that the arrToTest contains all the letters in requiredLetterArr
const containsAll = (requiredLetterArr, arrToTest) => {
  const letterMap = {};

  // Create a map of all the letters in the word, and how many times they appear
  requiredLetterArr.forEach((ltr) => {
    if (letterMap[ltr] === undefined) {
      letterMap[ltr] = 1;
      return;
    }
    letterMap[ltr] += 1;
  });


  // For each letter in the test word, subtract from the count
  arrToTest.forEach((ltr) => {
    if (letterMap[ltr] !== undefined) letterMap[ltr] -= 1;
  });

  // Check all the letters to make sure they are all <= 0. If not then there were letters not in the word
  let hasAll = true;
  Object.keys(letterMap).forEach((key) => {
    if (letterMap[key] > 0) hasAll = false;
  });

  return hasAll;
};

const getAllPossibleSolutions = (dictionaryWords, { greenLetters, yellowLetters, greyLetters, allLettersInWord }) => {
  // Create an array for all potential words
  const potentialSolutions = [];

  // For each word, we're going to determine if it's possible, or not possible
  dictionaryWords.forEach((word) => {
    let canWork = true;

    // Split the dictionary word to array of characters
    const wordSplit = word.split('');

    // Check if word (5 letters) has all of the "in word letters" (1 - 4 letters)
    const containsAllLetters = containsAll(allLettersInWord, wordSplit); // allLettersInWord.every(element => wordSplit.includes(element));
    if (!containsAllLetters) canWork = false;

    if (canWork) {
      // For each letter in the word, we have to check it against green letters, yellow letters, and grey letters
      Object.keys(wordSplit).forEach((letterIdx) => {
        const letter = wordSplit[letterIdx];

        // GREY START : Check if any grey letters occur in this word
        const letterExistInWordIdx = greyLetters.findIndex(ltr => ltr === letter);
        if (letterExistInWordIdx > -1) canWork = false;
        // GREY END

        // GREEN START : Check if any green letters appear in the correct positions
        if (canWork === true) {
          // If green letter in this position, return the letter, otherwise undefined
          const posGreenLetter = greenLetters[letterIdx];

          // Check if the returned "green letter" is undefined, or if it matches the "word letter"
          if (posGreenLetter !== undefined && posGreenLetter !== letter) {
            // The green letter does not match the word letter
            canWork = false;
          }
        }
        // GREEN END

        // YELLOW START : Check if this word has any yellow letters in a spot we know the letter is not supposed to be in
        if (canWork === true) {
          // Get the array of letters for this position
          const notPosLetters = yellowLetters[letterIdx];

          // Check if the word has the letter in a spot it's not supposed to be in
          const isExistIdx = notPosLetters.findIndex(ltr => ltr === letter);

          // If the letter appears in a spot we know it can't be in, then eliminate it
          if (isExistIdx > -1) {
            canWork = false;
          }
        }
        // YELLOW END
      });
    }

    // If the word can work, then add it to potential solutions
    if (canWork) {
      potentialSolutions.push(word);
    }
  });

  return potentialSolutions;
};

// This will find out how many times all the unguessed letters remain in the potential solutions
const findUnGuessedLetters = (potentialSolutions, allLettersInWord, greyLetters) => {
  const letterMap = {};

  // For each potential solution
  potentialSolutions.forEach((word) => {
    const wordSplit = word.split('');

    wordSplit.forEach((wordLtr) => {
      // Find out if the letter exists in the solution
      const inWordIdx = allLettersInWord.findIndex(ltr => ltr === wordLtr);
      // Find out if the letter was already guessed
      const greyLetterIdx = greyLetters.findIndex(ltr => ltr === wordLtr);

      // If the letter isn't in the solution and hasn't been guessed yet
      if (inWordIdx === -1 && greyLetterIdx === -1) {
        let letterArr = letterMap[wordLtr];
        if (letterArr === undefined) letterArr = 0;
        // Increment the number of times the letter has appeared in a possible solution
        letterArr += 1;
        letterMap[wordLtr] = letterArr;
      }
    });
  });

  return letterMap;
};


// Now find out which potential words have the most commonly occurring letters
const findWordsWithMostLetters = (dictionary, letterMap) => {
  const wordArr = [];

  // For each word in dictionary
  dictionary.forEach((word) => {
    const wordSplit = word.split('');
    let letterMatch = 0;
    const letterMatches = [];

    wordSplit.forEach((wordLtr) => {
      // Find out how many times this letter occurs in the remaining solutions
      const existCount = letterMap[wordLtr];
      // Make sure this letter hasn't already appeared in this word
      const alreadyInWord = letterMatches.findIndex(ltr => ltr === wordLtr);

      if (existCount !== undefined && alreadyInWord === -1) {
        letterMatch += existCount;
        letterMatches.push(wordLtr);
      }
    });

    // Add the word and the sum of number of times it's letters appeared in potential solutions
    if (letterMatch > 0) {
      wordArr.push({ word, count: letterMatch });
    }
  });

  // Sort so we get the words with the most common letters in solutions
  wordArr.sort((a, b) => b.count - a.count);

  return wordArr;
};

const addPossibilitiesToPopup = (ratedList) => {
  // Add the potential words to the HTML popup
  const parent = document.getElementById('solutions');
  if (parent.firstChild) parent.removeChild(parent.firstChild);
  const ul = document.createElement('ul');
  ul.setAttribute('id', 'proList');
  parent.appendChild(ul);
  ratedList.forEach(element => renderPossibilityList(ul, element));
};

const addGoodGuesses = (goodGuesses) => {
  // Add the good guesses to the HTML popup
  const parent = document.getElementById('guesses');
  if (parent.firstChild) parent.removeChild(parent.firstChild);
  const ul = document.createElement('ul');
  ul.setAttribute('id', 'goodList');
  parent.appendChild(ul);
  goodGuesses.forEach(element => renderPossibilityList(ul, `${element.word} (${element.count})`));
};

document.addEventListener('DOMContentLoaded', async () => {
  try {
    // Get the dictionary list from word-list.json
    const dictionaryWords = await fetch(chrome.runtime.getURL('word-list.json'))
      .then((response) => {
        if (response.ok) {
          return response.json();
        }

        throw new Error('File was not found or can\'t be reached');
      });

    // Get the current tab
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const tab = tabs[0];

    // The button helper for clicking "show possibilities"
    const checkPageButton = document.getElementById('showPossibles');
    checkPageButton.addEventListener('click', async () => {
      const gameState = await retrieveGameState(tab);

      const {
        allLettersInWord,
        greenLetters,
        greyLetters,
        yellowLetters,
      } = getGreenYellowGrey(gameState);

      const potentialSolutions = getAllPossibleSolutions(dictionaryWords, { greenLetters, yellowLetters, greyLetters, allLettersInWord });
      const letterMap = findUnGuessedLetters(potentialSolutions, allLettersInWord, greyLetters);
      const wordLotsLetters = findWordsWithMostLetters(dictionaryWords, letterMap);

      addPossibilitiesToPopup(potentialSolutions);
      addGoodGuesses(wordLotsLetters);
    });

    // Button to undo last guess
    const removeLastGuessBtn = document.getElementById('undo');
    removeLastGuessBtn.addEventListener('click', async () => {
      const gameState = await retrieveGameState(tab);
      gameState.rowIndex -= 1;
      const newRowIndex = gameState.rowIndex;
      gameState.boardState[newRowIndex] = '';
      gameState.evaluations[newRowIndex] = null;
      gameState.gameStatus = 'IN_PROGRESS';
      await removeLastGuessFunc(tab, gameState);
    });
  } catch (err) {
    // Log exceptions
  }
});