class Deque {
    constructor(maxLength = null) {
        this.items = [];
        this.maxLength = maxLength; // Maximum length of the deque
    }

    // Check if the deque contains a specific element
    contains(element) {
        return this.items.includes(element); // Check if the element exists in the deque
    }

    // Add an element to the back of the deque
    append(element) {
        if (this.maxLength && this.items.length >= this.maxLength) {
            this.popLeft(); // Remove the oldest element from the front
        }
        this.items.push(element); // Add to the back
    }

    // Add an element to the front of the deque
    appendLeft(element) {
        if (this.maxLength && this.items.length >= this.maxLength) {
            this.pop(); // Remove the oldest element from the back
        }
        this.items.unshift(element); // Add to the front
    }

    // Remove and return an element from the back of the deque
    pop() {
        if (this.isEmpty()) {
            throw new Error("Deque is empty");
        }
        return this.items.pop(); // Remove from the back
    }

    // Remove and return an element from the front of the deque
    popLeft() {
        if (this.isEmpty()) {
            throw new Error("Deque is empty");
        }
        return this.items.shift(); // Remove from the front
    }

    // Peek at the back element without removing it
    peek() {
        if (this.isEmpty()) {
            throw new Error("Deque is empty");
        }
        return this.items[this.items.length - 1];
    }

    // Peek at the front element without removing it
    peekLeft() {
        if (this.isEmpty()) {
            throw new Error("Deque is empty");
        }
        return this.items[0];
    }

    // Check if the deque is empty
    isEmpty() {
        return this.items.length === 0;
    }

    // Get the size of the deque
    size() {
        return this.items.length;
    }

    // Clear the deque
    clear() {
        this.items = [];
    }
}

module.exports = {
    Deque,
}