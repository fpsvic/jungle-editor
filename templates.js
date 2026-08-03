// Extended starter catalog. Each entry is self-contained and runnable in Jungle Editor.
(function buildAdditionalTemplates() {
    const catalog = {};
    const icons = { Python: '🐍', SQL: '🗄️', Java: '☕', Javascript: '⚡', 'C#': '🔷', 'C++': '➕' };
    const add = (id, lang, filename, name, desc, source) => {
        catalog[id] = { lang, files: { [filename]: source.trim() + '\n' }, currentFile: filename, meta: { name, desc, icon: icons[lang] } };
    };

    // Python — 8
    add('py-calculator', 'Python', 'main.py', 'Python Calculator', 'Functions and validated arithmetic', `
def calculate(a, operator, b):
    operations = {"+": lambda: a + b, "-": lambda: a - b, "*": lambda: a * b, "/": lambda: a / b}
    if operator not in operations:
        raise ValueError("Unsupported operator")
    return operations[operator]()

for expression in [(8, "+", 4), (9, "*", 3), (20, "/", 5)]:
    print(expression, "=", calculate(*expression))`);
    add('py-word-frequency', 'Python', 'main.py', 'Word Frequency', 'Count and rank words in text', `
from collections import Counter
import re

text = "Jungle Editor makes small coding experiments quick and coding ideas visible."
words = re.findall(r"[a-z]+", text.lower())
for word, count in Counter(words).most_common():
    print(f"{word:12} {count}")`);
    add('py-json-validator', 'Python', 'main.py', 'JSON Validator', 'Parse JSON with useful errors', `
import json

samples = ['{"name":"Jungle","version":1}', '{"broken": true,}']
for sample in samples:
    try:
        print("Valid:", json.loads(sample))
    except json.JSONDecodeError as error:
        print(f"Invalid at line {error.lineno}, column {error.colno}: {error.msg}")`);
    add('py-task-queue', 'Python', 'main.py', 'Task Queue', 'Priority queue with dataclasses', `
from dataclasses import dataclass, field
from heapq import heappush, heappop

@dataclass(order=True)
class Task:
    priority: int
    name: str = field(compare=False)

queue = []
for task in [Task(3, "document"), Task(1, "fix bug"), Task(2, "test")]:
    heappush(queue, task)
while queue:
    print("Running:", heappop(queue).name)`);
    add('py-binary-search', 'Python', 'main.py', 'Binary Search', 'Iterative search with edge cases', `
def binary_search(values, target):
    low, high = 0, len(values) - 1
    while low <= high:
        middle = (low + high) // 2
        if values[middle] == target:
            return middle
        if values[middle] < target:
            low = middle + 1
        else:
            high = middle - 1
    return -1

numbers = [2, 5, 8, 12, 16, 23, 38]
print(binary_search(numbers, 23))`);
    add('py-lru-cache', 'Python', 'main.py', 'Memoized Fibonacci', 'Caching and function decorators', `
from functools import lru_cache

@lru_cache(maxsize=None)
def fibonacci(n):
    if n < 2:
        return n
    return fibonacci(n - 1) + fibonacci(n - 2)

print([fibonacci(n) for n in range(15)])
print(fibonacci.cache_info())`);
    add('py-csv-summary', 'Python', 'main.py', 'CSV Summary', 'Read tabular data without files', `
import csv
import io

data = "name,score\nAda,96\nLinus,88\nGrace,100\n"
rows = list(csv.DictReader(io.StringIO(data)))
scores = [int(row["score"]) for row in rows]
print("Students:", len(rows))
print("Average:", sum(scores) / len(scores))
print("Highest:", max(rows, key=lambda row: int(row["score"])))`);
    add('py-unit-tests', 'Python', 'main.py', 'Python Unit Tests', 'A small unittest test suite', `
import unittest

def slugify(value):
    return "-".join(value.lower().strip().split())

class SlugifyTests(unittest.TestCase):
    def test_words(self):
        self.assertEqual(slugify("Jungle Editor"), "jungle-editor")
    def test_spacing(self):
        self.assertEqual(slugify("  small   test "), "small-test")

unittest.main()`);

    // SQL — 8
    add('sql-ecommerce', 'SQL', 'main.sql', 'E-commerce SQL', 'Orders, totals, and customer ranking', `
CREATE TABLE orders (id INTEGER, customer TEXT, total REAL);
INSERT INTO orders VALUES (1,'Ada',42.50),(2,'Grace',70.00),(3,'Ada',18.25);
SELECT customer, COUNT(*) AS orders, ROUND(SUM(total),2) AS spent
FROM orders GROUP BY customer ORDER BY spent DESC;`);
    add('sql-inventory', 'SQL', 'main.sql', 'Inventory SQL', 'Low-stock reporting and valuation', `
CREATE TABLE inventory (sku TEXT, item TEXT, quantity INTEGER, price REAL);
INSERT INTO inventory VALUES ('A1','Keyboard',5,49.99),('B2','Mouse',2,19.99),('C3','Monitor',8,179.00);
SELECT sku, item, quantity, ROUND(quantity * price, 2) AS value
FROM inventory WHERE quantity < 6 ORDER BY quantity;`);
    add('sql-library', 'SQL', 'main.sql', 'Library SQL', 'Joins between books and loans', `
CREATE TABLE books (id INTEGER PRIMARY KEY, title TEXT);
CREATE TABLE loans (book_id INTEGER, borrower TEXT, returned INTEGER);
INSERT INTO books VALUES (1,'Algorithms'),(2,'Clean Code'),(3,'Databases');
INSERT INTO loans VALUES (1,'Maya',0),(2,'Noah',1);
SELECT books.title, loans.borrower FROM books
LEFT JOIN loans ON loans.book_id = books.id WHERE COALESCE(loans.returned,0) = 0;`);
    add('sql-employees', 'SQL', 'main.sql', 'Employee SQL', 'Department aggregates and salaries', `
CREATE TABLE employees (name TEXT, department TEXT, salary INTEGER);
INSERT INTO employees VALUES ('Ana','Engineering',98000),('Ben','Design',82000),('Cy','Engineering',105000),('Dee','Design',91000);
SELECT department, COUNT(*) AS people, ROUND(AVG(salary),0) AS average_salary
FROM employees GROUP BY department ORDER BY average_salary DESC;`);
    add('sql-school', 'SQL', 'main.sql', 'School SQL', 'Student grades with CASE expressions', `
CREATE TABLE grades (student TEXT, subject TEXT, score INTEGER);
INSERT INTO grades VALUES ('Kai','Math',93),('Kai','Science',87),('Luz','Math',76),('Luz','Science',91);
SELECT student, ROUND(AVG(score),1) AS average,
CASE WHEN AVG(score) >= 90 THEN 'A' WHEN AVG(score) >= 80 THEN 'B' ELSE 'C' END AS grade
FROM grades GROUP BY student;`);
    add('sql-support', 'SQL', 'main.sql', 'Support Tickets SQL', 'Status counts and response priorities', `
CREATE TABLE tickets (id INTEGER, status TEXT, priority INTEGER, subject TEXT);
INSERT INTO tickets VALUES (1,'open',1,'Login failed'),(2,'closed',3,'Theme'),(3,'open',2,'Export error');
SELECT id, subject, CASE priority WHEN 1 THEN 'urgent' WHEN 2 THEN 'normal' ELSE 'low' END AS urgency
FROM tickets WHERE status = 'open' ORDER BY priority;`);
    add('sql-finance', 'SQL', 'main.sql', 'Budget SQL', 'Category totals and budget variance', `
CREATE TABLE spending (category TEXT, amount REAL, budget REAL);
INSERT INTO spending VALUES ('Hosting',80,100),('Tools',125,100),('Marketing',60,150);
SELECT category, amount, budget, ROUND(budget - amount,2) AS remaining,
CASE WHEN amount > budget THEN 'over' ELSE 'within' END AS status FROM spending;`);
    add('sql-analytics', 'SQL', 'main.sql', 'Event Analytics SQL', 'Funnel-style event aggregation', `
CREATE TABLE events (user_id INTEGER, event TEXT, day TEXT);
INSERT INTO events VALUES (1,'visit','2026-08-01'),(1,'signup','2026-08-01'),(2,'visit','2026-08-01'),(3,'visit','2026-08-02');
SELECT day, COUNT(DISTINCT user_id) AS users,
SUM(CASE WHEN event='signup' THEN 1 ELSE 0 END) AS signups
FROM events GROUP BY day ORDER BY day;`);

    const java = (body, helpers = '') => `import java.util.*;\n\npublic class Main {\n${helpers}\n    public static void main(String[] args) {\n${body}\n    }\n}`;
    add('java-collections', 'Java', 'Main.java', 'Java Collections', 'Lists, sets, and frequency maps', java('        List<String> words = List.of("code", "scan", "code", "run");\n        Map<String,Integer> counts = new TreeMap<>();\n        for (String word : words) counts.merge(word, 1, Integer::sum);\n        System.out.println(counts);'));
    add('java-streams', 'Java', 'Main.java', 'Java Streams', 'Filter, map, and reduce a collection', java('        List<Integer> values = List.of(3, 8, 11, 14, 20);\n        int sum = values.stream().filter(n -> n % 2 == 0).mapToInt(n -> n * n).sum();\n        System.out.println("Even square sum: " + sum);'));
    add('java-records', 'Java', 'Main.java', 'Java Records', 'Immutable data and sorting', java('        List<Player> players = new ArrayList<>(List.of(new Player("Ada", 92), new Player("Lin", 87)));\n        players.sort(Comparator.comparingInt(Player::score).reversed());\n        players.forEach(System.out::println);', '    record Player(String name, int score) {}\n'));
    add('java-stack', 'Java', 'Main.java', 'Balanced Brackets', 'Stack-based delimiter validation', java('        for (String sample : List.of("{[()]}", "{[(])}"))\n            System.out.println(sample + " -> " + balanced(sample));', '    static boolean balanced(String text) {\n        Deque<Character> stack = new ArrayDeque<>();\n        Map<Character,Character> pairs = Map.of(\')\',\'(\',\']\',\'[\',\'}\',\'{\');\n        for (char c : text.toCharArray()) {\n            if ("([{ ".indexOf(c) >= 0 && c != \' \') stack.push(c);\n            else if (pairs.containsKey(c) && (stack.isEmpty() || stack.pop() != pairs.get(c))) return false;\n        }\n        return stack.isEmpty();\n    }\n'));
    add('java-binary-search', 'Java', 'Main.java', 'Java Binary Search', 'Generic search over sorted values', java('        int[] values = {2,5,8,12,16,23};\n        System.out.println(Arrays.binarySearch(values, 12));'));
    add('java-queue', 'Java', 'Main.java', 'Java Priority Queue', 'Schedule jobs by priority', java('        PriorityQueue<Job> jobs = new PriorityQueue<>(Comparator.comparingInt(Job::priority));\n        jobs.add(new Job("Deploy", 3)); jobs.add(new Job("Fix bug", 1)); jobs.add(new Job("Test", 2));\n        while (!jobs.isEmpty()) System.out.println(jobs.remove().name());', '    record Job(String name, int priority) {}\n'));
    add('java-optionals', 'Java', 'Main.java', 'Java Optional', 'Safe lookup without null checks', java('        Map<Integer,String> users = Map.of(1, "Mina", 2, "Omar");\n        String result = Optional.ofNullable(users.get(3)).orElse("Unknown user");\n        System.out.println(result);'));
    add('java-exceptions', 'Java', 'Main.java', 'Java Validation', 'Custom exceptions and input rules', java('        for (String value : List.of("42", "-3")) {\n            try { System.out.println(parsePositive(value)); }\n            catch (IllegalArgumentException error) { System.out.println(error.getMessage()); }\n        }', '    static int parsePositive(String value) {\n        int number = Integer.parseInt(value);\n        if (number < 0) throw new IllegalArgumentException("Expected a positive number");\n        return number;\n    }\n'));

    // JavaScript — 7
    add('js-array-pipeline', 'Javascript', 'main.js', 'Array Pipeline', 'Transform and summarize objects', `
const orders = [{ total: 20, paid: true }, { total: 15, paid: false }, { total: 40, paid: true }];
const revenue = orders.filter(order => order.paid).map(order => order.total).reduce((sum, value) => sum + value, 0);
console.log({ revenue });`);
    add('js-event-emitter', 'Javascript', 'main.js', 'Event Emitter', 'A tiny publish-and-subscribe utility', `
class Emitter {
    constructor() { this.listeners = new Map(); }
    on(name, fn) { this.listeners.set(name, [...(this.listeners.get(name) || []), fn]); }
    emit(name, value) { for (const fn of this.listeners.get(name) || []) fn(value); }
}
const events = new Emitter();
events.on("saved", file => console.log("Saved", file));
events.emit("saved", "main.js");`);
    add('js-debounce', 'Javascript', 'main.js', 'Debounce Utility', 'Delay repeated function calls', `
function debounce(fn, delay) {
    let timer;
    return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), delay); };
}
const search = debounce(query => console.log("Searching:", query), 50);
search("jun"); search("jungle");`);
    add('js-promise-pool', 'Javascript', 'main.js', 'Async Task Runner', 'Run asynchronous work safely', `
const wait = (ms, value) => new Promise(resolve => setTimeout(() => resolve(value), ms));
async function main() {
    const results = await Promise.all([wait(30, "scan"), wait(10, "edit"), wait(20, "run")]);
    console.log(results);
}
main().catch(console.error);`);
    add('js-group-by', 'Javascript', 'main.js', 'Group By', 'Build a reusable grouping helper', `
function groupBy(items, key) {
    return items.reduce((groups, item) => ({ ...groups, [item[key]]: [...(groups[item[key]] || []), item] }), {});
}
const bugs = [{ severity: "high", id: 1 }, { severity: "low", id: 2 }, { severity: "high", id: 3 }];
console.log(groupBy(bugs, "severity"));`);
    add('js-state-machine', 'Javascript', 'main.js', 'State Machine', 'Model explicit application transitions', `
const transitions = { idle: { start: "running" }, running: { finish: "done", fail: "failed" }, failed: { retry: "running" } };
let state = "idle";
function send(event) {
    const next = transitions[state]?.[event];
    if (!next) throw new Error("Invalid transition: " + state + " -> " + event);
    state = next; console.log(state);
}
send("start"); send("finish");`);
    add('js-tests', 'Javascript', 'main.js', 'Tiny JS Tests', 'Assertions without a framework', `
const equal = (actual, expected, name) => {
    if (actual !== expected) throw new Error(name + ": expected " + expected + ", got " + actual);
    console.log("PASS", name);
};
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
equal(clamp(12, 0, 10), 10, "upper bound");
equal(clamp(-2, 0, 10), 0, "lower bound");`);

    const cs = (body, helpers = '') => `using System;\nusing System.Collections.Generic;\nusing System.Linq;\n\nclass Program {\n${helpers}\n    static void Main() {\n${body}\n    }\n}`;
    add('cs-linq', 'C#', 'Main.cs', 'C# LINQ', 'Query and aggregate typed records', cs('        var scores = new[] { 72, 91, 84, 96, 65 };\n        var passing = scores.Where(score => score >= 80).OrderByDescending(score => score);\n        Console.WriteLine(string.Join(", ", passing));\n        Console.WriteLine($"Average: {scores.Average():F1}");'));
    add('cs-records', 'C#', 'Main.cs', 'C# Records', 'Immutable values and grouping', cs('        var people = new[] { new Person("Ada", "Dev"), new Person("Mia", "Design"), new Person("Lin", "Dev") };\n        foreach (var group in people.GroupBy(person => person.Team)) Console.WriteLine($"{group.Key}: {group.Count()}");', '    record Person(string Name, string Team);\n'));
    add('cs-dictionary', 'C#', 'Main.cs', 'C# Dictionary', 'Count words safely', cs('        var counts = new Dictionary<string, int>();\n        foreach (var word in "code scan code debug run".Split(\' \')) {\n            counts[word] = counts.GetValueOrDefault(word) + 1;\n        }\n        foreach (var pair in counts.OrderBy(pair => pair.Key)) Console.WriteLine($"{pair.Key}: {pair.Value}");'));
    add('cs-stack', 'C#', 'Main.cs', 'C# Stack', 'Validate balanced delimiters', cs('        foreach (var text in new[] { "{[()]}", "{[(])}" }) Console.WriteLine($"{text}: {Balanced(text)}");', '    static bool Balanced(string text) {\n        var stack = new Stack<char>();\n        var pairs = new Dictionary<char,char> { [\')\']=\'(\', [\']\']=\'[\', [\'}\']=\'{\' };\n        foreach (var c in text) {\n            if ("([{ ".Contains(c) && c != \' \') stack.Push(c);\n            else if (pairs.ContainsKey(c) && (stack.Count == 0 || stack.Pop() != pairs[c])) return false;\n        }\n        return stack.Count == 0;\n    }\n'));
    add('cs-validation', 'C#', 'Main.cs', 'C# Validation', 'Parse inputs with TryParse', cs('        foreach (var input in new[] { "42", "oops", "-7" }) {\n            if (int.TryParse(input, out var value) && value >= 0) Console.WriteLine($"Valid: {value}");\n            else Console.WriteLine($"Invalid: {input}");\n        }'));
    add('cs-queue', 'C#', 'Main.cs', 'C# Queue', 'First-in, first-out job processing', cs('        var jobs = new Queue<string>(new[] { "scan", "compile", "test" });\n        while (jobs.Count > 0) Console.WriteLine($"Running {jobs.Dequeue()}");'));
    add('cs-events', 'C#', 'Main.cs', 'C# Events', 'Publish strongly typed notifications', cs('        var counter = new Counter();\n        counter.Changed += value => Console.WriteLine($"Count: {value}");\n        counter.Increment(); counter.Increment();', '    class Counter {\n        public event Action<int>? Changed;\n        private int value;\n        public void Increment() { value++; Changed?.Invoke(value); }\n    }\n'));

    const cpp = (body, helpers = '') => `#include <iostream>\n#include <vector>\n#include <string>\n#include <algorithm>\n#include <map>\n#include <queue>\nusing namespace std;\n\n${helpers}\nint main() {\n${body}\n    return 0;\n}`;
    add('cpp-sort', 'C++', 'main.cpp', 'C++ Sorting', 'Sort and filter a vector', cpp('    vector<int> values{8, 3, 12, 1, 7};\n    sort(values.begin(), values.end());\n    for (int value : values) if (value % 2 == 0) cout << value << " ";\n    cout << "\\n";'));
    add('cpp-frequency', 'C++', 'main.cpp', 'C++ Frequency Map', 'Count values with std::map', cpp('    vector<string> words{"code", "scan", "code", "run"};\n    map<string, int> counts;\n    for (const auto& word : words) counts[word]++;\n    for (const auto& [word, count] : counts) cout << word << ": " << count << "\\n";'));
    add('cpp-binary-search', 'C++', 'main.cpp', 'C++ Binary Search', 'Search a sorted container', cpp('    vector<int> values{2, 5, 8, 12, 16, 23};\n    int target = 12;\n    auto found = lower_bound(values.begin(), values.end(), target);\n    cout << (found != values.end() && *found == target ? "found" : "missing") << "\\n";'));
    add('cpp-priority-queue', 'C++', 'main.cpp', 'C++ Priority Queue', 'Process high-priority work first', cpp('    priority_queue<pair<int, string>, vector<pair<int, string>>, greater<pair<int, string>>> jobs;\n    jobs.push({3, "deploy"}); jobs.push({1, "fix bug"}); jobs.push({2, "test"});\n    while (!jobs.empty()) { cout << jobs.top().second << "\\n"; jobs.pop(); }'));
    add('cpp-raii', 'C++', 'main.cpp', 'C++ RAII', 'Automatic resource lifetime tracing', cpp('    cout << "Entering scope\\n";\n    { Resource resource("cache"); resource.use(); }\n    cout << "Scope ended\\n";', 'class Resource {\n    string name;\npublic:\n    explicit Resource(string value) : name(move(value)) { cout << "Open " << name << "\\n"; }\n    ~Resource() { cout << "Close " << name << "\\n"; }\n    void use() const { cout << "Use " << name << "\\n"; }\n};\n'));
    add('cpp-templates', 'C++', 'main.cpp', 'C++ Generic Function', 'Reusable templated algorithms', cpp('    cout << clampValue(14, 0, 10) << "\\n";\n    cout << clampValue(2.5, 3.0, 8.0) << "\\n";', 'template <typename T>\nT clampValue(T value, T low, T high) { return min(high, max(low, value)); }\n'));
    add('cpp-graph', 'C++', 'main.cpp', 'C++ Graph Traversal', 'Breadth-first search over a graph', cpp('    vector<vector<int>> graph{{1,2},{3},{3},{}};\n    queue<int> pending; vector<bool> seen(graph.size());\n    pending.push(0); seen[0] = true;\n    while (!pending.empty()) {\n        int node = pending.front(); pending.pop(); cout << node << " ";\n        for (int next : graph[node]) if (!seen[next]) { seen[next] = true; pending.push(next); }\n    }\n    cout << "\\n";'));

    window.JUNGLE_ADDITIONAL_TEMPLATES = catalog;
})();
