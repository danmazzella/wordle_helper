const getGameState = () => localStorage.gameState;

const replaceAt = (str, index, replacement) => str.substr(0, index) + replacement + str.substr(index + replacement.length);

// Take a guess and a solution, and compare the guess against the solution
// to determine how many letters appear in the correct spot and how many letters
// appear in the wrong spot. This will help us determine which words have the most 
// re-occurring letters
const processGuess = (guess, solution) => {
  let correctSpot = 0;
  let wrongSpot = 0;

  // Create a deep copy
  let usedSolution = ` ${solution}`.slice(1);

  const guessArr = guess.split('');
  // For each letters in the guess....
  Object.keys(guessArr).forEach((guessLtrIdx) => {
    const guessLtr = guessArr[guessLtrIdx];

    // See if the letter is in the correct for the solution
    if (guessLtr === solution[guessLtrIdx]) {
      correctSpot += 1;
      usedSolution = replaceAt(usedSolution, guessLtrIdx, '0');
    } else {
      const solutionArr = solution.split('');
      // Compare the letter against every letter in the solution
      Object.keys(solutionArr).forEach((solutionLtrIdx) => {
        const solutionLtr = solutionArr[solutionLtrIdx];
        if (guessLtrIdx !== solutionLtrIdx && usedSolution[solutionLtrIdx] !== '0' && guessLtr === solutionLtr) {
          usedSolution = replaceAt(usedSolution, solutionLtrIdx, '0');
          wrongSpot += 1;
        }
      })
    }
  })

  return [correctSpot, wrongSpot];
};

// Show the possibilities in the popup
const renderPossibilityList = (ul, element) => {
  const li = document.createElement('li');
  li.setAttribute('class', 'item');
  ul.appendChild(li);
  li.innerHTML += element;
};

// For every word in the word list, compare it to the rest of the words in the word list
const calculateRatings = (potentialSolutions) => {
  const wordResults = {};
  Object.keys(potentialSolutions).forEach((isSolutionIdx) => {
    const isSolution = potentialSolutions[isSolutionIdx];
    Object.keys(potentialSolutions).forEach((guessIdx) => {
      const guess = potentialSolutions[guessIdx];
      const results = processGuess(guess, isSolution);
      if (wordResults[guess]) {
        wordResults[guess][0] += results[0];
        wordResults[guess][1] += results[1];
      } else {
        wordResults[guess] = results;
      }
    });
  });

  return wordResults;
};

const retrieveGameState = (tab) => new Promise(async (resolve) => {
  // Get the gameState for getting guesses and solution
  const gameStateStr = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    function: getGameState,
  });

  // Convert gameState to JSON
  const gameState = JSON.parse(gameStateStr[0].result);

  return resolve(gameState);
});

const getGreenYellowGrey = (gameState) => {
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

      // For each letter in the guess, we will compare it with every letter in the solution
      Object.keys(guessSplit).forEach((letterIdx) => {
        // This is the current letter in guess
        const guessLtr = guessSplit[letterIdx];

        // Where the guessed letter appears in the solution
        const letterExistInWordIdx = solutionSplit.findIndex(solutionLtr => guessLtr === solutionLtr);

        if (letterExistInWordIdx === -1) {
          // The letter does not exist at all in solution, add to greyLetters
          greyLetters.push(guessLtr);
        } else if (parseInt(letterExistInWordIdx, 10) === parseInt(letterIdx, 10)) {
          // The letter is a green letter, add to greenLetters
          greenLetters[letterIdx] = guessLtr;
        } else {
          // The letter is a yellow letter, add to yellowLetters
          yellowLetters[letterIdx].push(guessLtr);
        }
      });
    }
  });

  return {
    greenLetters, yellowLetters, greyLetters,
  }
}

const getAllPossibleSolutions = (dictionaryWords, { greenLetters, yellowLetters, greyLetters }) => {
  // Create an array for all potential words
  const potentialSolutions = [];

  // For each word, we're going to determine if it's possible, or not possible
  dictionaryWords.forEach((word) => {
    let canWork = true;

    // Split the dictionary word to array of characters
    const wordSplit = word.split('');

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

    // If the word can work, then add it to potential solutions
    if (canWork) potentialSolutions.push(word);
  });

  return potentialSolutions;
}

const getOrderedListOfSolutions = (potentialSolutions) => {
  // Now we are going to determine the likely hood of the answer based on most common letters
  const wordResults = calculateRatings(potentialSolutions);

  // Sort the above result by how likely that word is to appear
  // Letters that appear in the correct spot have double weight as those in the wrong spot
  const wordResultsFrequency = Object
    .fromEntries(Object
      .entries(wordResults).sort(([, a], [, b]) => ((b[0] * 2) + b[1]) - ((a[0] * 2) + a[1])));

  // Just return the words without the "likelyhood"
  const ratedList = [];
  Object.keys(wordResultsFrequency).forEach(key => ratedList.push(key));

  return ratedList;
}

const addPossibilitiesToPopup = async (ratedList) => {
  // Add the potential words to the HTML popup
  const ul = document.createElement('ul');
  ul.setAttribute('id', 'proList');
  document.getElementById('main').appendChild(ul);
  ratedList.forEach(element => renderPossibilityList(ul, element));
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
      const { greenLetters, yellowLetters, greyLetters } = getGreenYellowGrey(gameState);
      const potentialSolutions = getAllPossibleSolutions(dictionaryWords, { greenLetters, yellowLetters, greyLetters });
      const ratedList = getOrderedListOfSolutions(potentialSolutions);
      addPossibilitiesToPopup(ratedList);
    });
  } catch (err) {
    // Log exceptions
  }
});