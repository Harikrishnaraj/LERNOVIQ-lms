// Fixture courses and question -> expected-lesson pairs for the retrieval quality check (T-225,
// RAG_PLAN §8). Three courses of ten lessons each; every lesson is a short paragraph of the kind
// an instructor writes. Each question is phrased the way a learner would ask it, not copied from
// the lesson title, and names the one lesson that should answer it.

export interface EvalLesson {
  title: string;
  content: string;
}

export interface EvalCourse {
  key: string;
  title: string;
  lessons: EvalLesson[];
}

export interface EvalQuestion {
  question: string;
  course: string;
  lesson: string;
}

const p = (...sentences: string[]) => `<p>${sentences.join(" ")}</p>`;

export const EVAL_COURSES: EvalCourse[] = [
  {
    key: "js",
    title: "JavaScript Essentials",
    lessons: [
      {
        title: "Variables with let and const",
        content: p(
          "Declare a variable with let when its value will change and with const when it will not.",
          "A const binding cannot be reassigned, although the object it points to can still be modified.",
          "Avoid var because it is function scoped and hoisted, which causes surprising bugs.",
        ),
      },
      {
        title: "Functions and closures",
        content: p(
          "A closure is a function that remembers the variables of the scope where it was created, even after that scope has finished running.",
          "Closures let you build private state, such as a counter that no other code can modify.",
          "Arrow functions are a shorter syntax and do not have their own this value.",
        ),
      },
      {
        title: "Transforming arrays with map and filter",
        content: p(
          "The map method creates a new array by applying a function to every element.",
          "The filter method keeps only the elements for which the callback returns true.",
          "Use reduce when you need to combine all elements into a single value such as a sum.",
        ),
      },
      {
        title: "Promises and async await",
        content: p(
          "A promise represents a value that will be available later, either fulfilled or rejected.",
          "The async keyword makes a function return a promise, and await pauses it until another promise settles.",
          "Use Promise.all to run several asynchronous requests in parallel and wait for all of them.",
        ),
      },
      {
        title: "The event loop",
        content: p(
          "JavaScript runs on a single thread, so long tasks block the page.",
          "The event loop takes callbacks from the task queue and runs them once the call stack is empty.",
          "Promise callbacks go to the microtask queue, which is drained before the next timer callback runs.",
        ),
      },
      {
        title: "Handling DOM events",
        content: p(
          "Use addEventListener to run code when a user clicks a button or types in a field.",
          "Events bubble up from the target element through its ancestors, so one listener on a parent can handle many children.",
          "Call preventDefault to stop a form from submitting or a link from navigating.",
        ),
      },
      {
        title: "ES modules",
        content: p(
          "Split code into files with export and import statements.",
          "A default export is imported without braces, while named exports are imported inside braces.",
          "Modules have their own scope, so nothing leaks into the global namespace.",
        ),
      },
      {
        title: "Error handling",
        content: p(
          "Wrap risky code in a try block and handle failures in the catch block.",
          "The finally block always runs, which makes it the right place to release resources.",
          "Throw an Error object rather than a string so the stack trace is preserved.",
        ),
      },
      {
        title: "Working with JSON",
        content: p(
          "JSON.stringify converts an object into a JSON string you can send to a server.",
          "JSON.parse turns a JSON string back into an object and throws a SyntaxError if the text is malformed.",
          "Functions and undefined values are dropped when an object is stringified.",
        ),
      },
      {
        title: "Classes and prototypes",
        content: p(
          "The class syntax creates constructor functions with methods placed on the prototype.",
          "Use extends to inherit from another class and call super in the constructor.",
          "Every object has a prototype chain that JavaScript walks when you look up a property.",
        ),
      },
    ],
  },
  {
    key: "sql",
    title: "Data Analysis with SQL",
    lessons: [
      {
        title: "Selecting data",
        content: p(
          "The SELECT statement chooses which columns to return from a table.",
          "Use an alias with AS to rename a column in the output, and DISTINCT to remove duplicate rows.",
          "Add ORDER BY to sort the result and LIMIT to return only the first few rows.",
        ),
      },
      {
        title: "Filtering rows with WHERE",
        content: p(
          "The WHERE clause keeps only the rows that satisfy a condition.",
          "Combine conditions with AND and OR, test ranges with BETWEEN, and match patterns with LIKE.",
          "Use IS NULL to find missing values because equals never matches NULL.",
        ),
      },
      {
        title: "Joining tables",
        content: p(
          "A JOIN combines rows from two tables based on a matching column such as a customer id.",
          "An inner join returns only matching rows, while a left join also keeps rows from the left table that have no match.",
          "Always qualify column names with the table alias to avoid ambiguity.",
        ),
      },
      {
        title: "Grouping and aggregates",
        content: p(
          "GROUP BY splits rows into groups so that aggregate functions such as COUNT, SUM and AVG are calculated per group.",
          "Every selected column must either be aggregated or appear in the GROUP BY clause.",
          "COUNT of star counts rows, while COUNT of a column ignores NULL values.",
        ),
      },
      {
        title: "Filtering groups with HAVING",
        content: p(
          "WHERE filters rows before grouping, but HAVING filters groups after the aggregates are computed.",
          "Use HAVING COUNT greater than five to keep only the categories with more than five orders.",
        ),
      },
      {
        title: "Subqueries and CTEs",
        content: p(
          "A subquery is a query nested inside another query, for example to compare each salary with the overall average.",
          "A common table expression, written with the WITH keyword, gives a subquery a name and makes long queries easier to read.",
        ),
      },
      {
        title: "Window functions",
        content: p(
          "Window functions calculate a value across related rows without collapsing them into one row.",
          "ROW_NUMBER and RANK number the rows inside each partition, and the OVER clause defines the partition and the ordering.",
          "A running total uses SUM with OVER and ORDER BY.",
        ),
      },
      {
        title: "Indexes and query speed",
        content: p(
          "An index lets the database find rows without scanning the whole table, which makes a slow query much faster.",
          "Create indexes on columns used in WHERE and JOIN conditions, but remember that every index slows down inserts.",
          "Use EXPLAIN to see whether the planner uses an index.",
        ),
      },
      {
        title: "Normalization",
        content: p(
          "Normalization organizes tables to remove duplicated data and update anomalies.",
          "Split a table into separate tables linked by foreign keys so each fact is stored once.",
          "Third normal form requires that non-key columns depend only on the primary key.",
        ),
      },
      {
        title: "Transactions",
        content: p(
          "A transaction groups several statements so they all succeed or all fail together.",
          "Use BEGIN to start, COMMIT to save the changes and ROLLBACK to undo them.",
          "Transactions follow the ACID properties: atomicity, consistency, isolation and durability.",
        ),
      },
    ],
  },
  {
    key: "ux",
    title: "UX Design Foundations",
    lessons: [
      {
        title: "User interviews",
        content: p(
          "Interview five to eight users to understand their goals and frustrations before designing anything.",
          "Ask open questions such as walk me through the last time you did this, and avoid leading questions.",
          "Listen more than you talk and record the session with permission.",
        ),
      },
      {
        title: "Personas",
        content: p(
          "A persona is a fictional character that summarizes the needs, goals and behaviors of a group of users.",
          "Base personas on research data rather than assumptions, and keep them to a single page.",
        ),
      },
      {
        title: "Wireframing",
        content: p(
          "A wireframe is a low fidelity sketch of a screen that shows layout and content but not colors or images.",
          "Start with paper sketches, then move to a tool, and test the flow before adding visual design.",
        ),
      },
      {
        title: "Color contrast and accessibility",
        content: p(
          "Text must have enough contrast against its background: the WCAG guidelines require a ratio of at least 4.5 to 1 for body text.",
          "Never use color as the only way to convey meaning, because colorblind users may miss it.",
          "Provide alt text for images and make every control usable with a keyboard.",
        ),
      },
      {
        title: "Typography and visual hierarchy",
        content: p(
          "Visual hierarchy guides the eye through size, weight and spacing, so headings stand out from body text.",
          "Limit a design to two typefaces and keep line length between fifty and seventy-five characters for comfortable reading.",
        ),
      },
      {
        title: "Usability testing",
        content: p(
          "In a usability test you ask participants to complete realistic tasks while you observe where they struggle.",
          "Ask them to think aloud, and note the task success rate and the time on task.",
          "Five participants will reveal most of the serious problems.",
        ),
      },
      {
        title: "Information architecture",
        content: p(
          "Information architecture is how content is organized and labeled so people can find it.",
          "Use card sorting to learn how users group topics, and keep navigation menus short and predictable.",
        ),
      },
      {
        title: "Design systems",
        content: p(
          "A design system is a shared library of reusable components, design tokens and guidelines.",
          "It keeps products consistent, speeds up development and makes it easier for teams to maintain the interface.",
        ),
      },
      {
        title: "Responsive layouts",
        content: p(
          "A responsive layout adapts to the size of the screen using flexible grids and breakpoints.",
          "Design for the smallest phone screen first, then enhance the layout for tablets and desktops.",
        ),
      },
      {
        title: "Microcopy",
        content: p(
          "Microcopy is the small text in an interface, such as button labels, hints and error messages.",
          "Write error messages that say what went wrong and how to fix it, in a friendly tone without blame.",
        ),
      },
    ],
  },
];

export const EVAL_QUESTIONS: EvalQuestion[] = [
  // JavaScript Essentials
  {
    course: "js",
    lesson: "Variables with let and const",
    question: "Is it a good idea to still use var?",
  },
  {
    course: "js",
    lesson: "Functions and closures",
    question: "What is a closure and why would I want one?",
  },
  {
    course: "js",
    lesson: "Transforming arrays with map and filter",
    question: "Which array method gives me a list with just the matching items?",
  },
  {
    course: "js",
    lesson: "Promises and async await",
    question: "How do I wait for several async requests at the same time?",
  },
  {
    course: "js",
    lesson: "The event loop",
    question: "What happens to my page while a heavy calculation is running?",
  },
  {
    course: "js",
    lesson: "Handling DOM events",
    question: "What happens when I click a child element inside a parent?",
  },
  {
    course: "js",
    lesson: "ES modules",
    question: "What is the difference between a default export and a named export?",
  },
  {
    course: "js",
    lesson: "Error handling",
    question: "Where should I release resources when my code throws an error?",
  },
  {
    course: "js",
    lesson: "Working with JSON",
    question: "How do I convert an object to a string to send to a server?",
  },
  {
    course: "js",
    lesson: "Classes and prototypes",
    question: "How does inheritance work with extends and super?",
  },
  // Data Analysis with SQL
  {
    course: "sql",
    lesson: "Selecting data",
    question: "Can I give a column a different name in the results?",
  },
  {
    course: "sql",
    lesson: "Filtering rows with WHERE",
    question: "Why doesn't equals work to find missing values?",
  },
  {
    course: "sql",
    lesson: "Joining tables",
    question: "What is the difference between an inner join and a left join?",
  },
  {
    course: "sql",
    lesson: "Grouping and aggregates",
    question: "Why do I get an error when I select a column that is not in the GROUP BY?",
  },
  {
    course: "sql",
    lesson: "Filtering groups with HAVING",
    question: "How do I keep only categories that have more than five orders?",
  },
  {
    course: "sql",
    lesson: "Subqueries and CTEs",
    question: "What does the WITH keyword do in a query?",
  },
  {
    course: "sql",
    lesson: "Window functions",
    question: "How do I number the rows inside each partition?",
  },
  {
    course: "sql",
    lesson: "Indexes and query speed",
    question: "What speeds up lookups on a big table?",
  },
  {
    course: "sql",
    lesson: "Normalization",
    question: "How do I remove duplicated data across tables using foreign keys?",
  },
  {
    course: "sql",
    lesson: "Transactions",
    question: "What guarantees that either everything is saved or nothing is?",
  },
  // UX Design Foundations
  {
    course: "ux",
    lesson: "User interviews",
    question: "What kind of questions should I ask in a user interview?",
  },
  {
    course: "ux",
    lesson: "Personas",
    question: "What is a persona and what should it be based on?",
  },
  {
    course: "ux",
    lesson: "Wireframing",
    question: "What is a low fidelity sketch of a screen called?",
  },
  {
    course: "ux",
    lesson: "Color contrast and accessibility",
    question: "What contrast ratio does body text need for accessibility?",
  },
  {
    course: "ux",
    lesson: "Typography and visual hierarchy",
    question: "How many typefaces should a design use and how long should lines be?",
  },
  {
    course: "ux",
    lesson: "Usability testing",
    question: "How many participants do I need to find most usability problems?",
  },
  {
    course: "ux",
    lesson: "Information architecture",
    question: "How do I find out how people would sort the menu items?",
  },
  {
    course: "ux",
    lesson: "Design systems",
    question: "What are design tokens and reusable components?",
  },
  {
    course: "ux",
    lesson: "Responsive layouts",
    question: "What screen size do I start with when making a layout adapt?",
  },
  {
    course: "ux",
    lesson: "Microcopy",
    question: "What tone should the text on a failed form have?",
  },
];
