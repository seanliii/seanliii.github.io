import random


def play_game():
    secret = random.randint(1, 100)
    attempts = 0

    print("=== Python Guess the Number ===")
    print("I picked a number from 1 to 100.")

    while True:
        try:
            guess = int(input("Your guess: "))
        except ValueError:
            print("Please enter a whole number.")
            continue

        if not 1 <= guess <= 100:
            print("Enter a number between 1 and 100.")
            continue

        attempts += 1
        if guess < secret:
            print("Too low!")
        elif guess > secret:
            print("Too high!")
        else:
            print(f"Correct! You won in {attempts} attempts.")
            break


def main():
    while True:
        play_game()
        again = input("Play again? (y/n): " ).strip().lower()
        if again != "y":
            print("Thanks for playing!")
            break
        print()


if __name__ == "__main__":
    main()
