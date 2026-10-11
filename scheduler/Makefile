CC      ?= gcc
CFLAGS  ?= -Wall -Wextra -Wpedantic -std=c11 -O2
TARGET  = ecosched_scheduler
TESTBIN = test_scheduler

all: $(TARGET)

$(TARGET): scheduler_cli.c priority_scheduler.c priority_scheduler.h
	$(CC) $(CFLAGS) -o $(TARGET) scheduler_cli.c priority_scheduler.c

$(TESTBIN): test_scheduler.c priority_scheduler.c priority_scheduler.h
	$(CC) $(CFLAGS) -o $(TESTBIN) test_scheduler.c priority_scheduler.c

test: $(TESTBIN) $(TARGET)
	./$(TESTBIN)
	sh tests/cli_test.sh

clean:
	rm -f $(TARGET) $(TESTBIN) *.o

.PHONY: all test clean
