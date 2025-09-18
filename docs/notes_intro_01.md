MyEspruinoTester01

Posted at 2024-06-11 by @SimonGAndrews

Hi , in the context of testing out a new build of Espruino such as the ESP c3 and how to approach this.

I stumbled across the Espruino/test directory in github , and testing with ./Espruino --test,
But it looks like this is for running in a linux build of Espruino only. Is that correct ??

is there an approach to structuring tests for a new build? I suppose:

it would be useful to have tests that can be repeated, particularly incases where the build may well go thru further iterations (eg IDF 4.x , idf5.x).
tests will be exercising hardware and peripherals, so will need to have board connection, i2c devices , network etc.
maybe at the at least structuring some simple JS scripts with documented and simple connection setup that can be repeated for a family of devices.

Posted at 2024-06-11 by @gfwilliams

testing with ./Espruino --test, But it looks like this is for running in a linux build of Espruino only. Is that correct ??

That's right, yes...

Over the years I have had several attempts at setting something up, including having a Raspberry Pi that will flash the devices and the run tests on them, but there's never been a massive amount of interest and I've never got to the point of setting something up permanently - the permanent setup I had about 10 years ago failed (and didn't handle nRF52) and I never got around to doing anything new.

This is the latest code if it's any help: https://github.com/espruino/EspruinoTester

Ideally if you could add ESP32 tests and flashing in there, at least there will also be the ability to flash the official boards too.

The idea is we can have several directories of tests - some for generic JS, some for bluetooth, wifi, specific features only on certain devices, etc.

Testing I2C/etc is a bit problematic but the safest is probably to agree on some cheap device that can be written/read (I2C EEPROM/etc) that can be wired up with minimal wires, and those could be added to the hardware. I feel like those are probably not the most important tests anyway though, and generally once working they stay working.

The thing I've always felt was missing was a nice way of displaying the information such that it could be dug into nicely. Not sure if you have any ideas?

Test pass/fail is pretty straightforward, but it's nice to store other stats too (speed+firmware size). In the initial setup I had some benchmarks I ran and there were a few times when I looked at the graph and saw things got slower/bigger, and managed to drill down to the commit and fix it. It's also more of a motivation to improve things as you can actually see it :)

Posted at 2024-06-12 by @SimonGAndrews

Hi , thanks @gfwilliams , I think I can see your structure and general approach: flash/run tests in node on a host, use a board config that specifies test paramaters the relevant tests, structure test scripts in the file system on the host, using a standard test execute method from node around the Espruino CLI tool. All makes good sense.
And your thoughts or collecting various stats, with simple analysis eg comparison of test runs over time/ builds makes sense too. Your approach would allow small test result stats files (eg JSON) to be stored on the host over time, in a boards structure, and analysed with a tool there. A configuration of the relevant stat and measurement function for a board could work.
Lots to think about. But I get your framework and the idea of structuring tests this way now to evolve the whole concept.

Posted at 2024-06-12 by @gfwilliams

Thanks! I know the actual code's a bit of a mess - it was more about trying to get something working quickly - but if you fancy working on it and want to change it around I'm more than happy :)

Your approach would allow small test result stats files (eg JSON) to be stored on the host over time, in a boards structure, and analysed with a tool there

IIRC it's what it does, but I'm not sure if that's really the best route. It's what I did originally, and then I had a script which ran over them and generated one big JSON file of relevant info that was viewable on a website online - but in the end with the tens of thousands of commits it took quite a long while to do that after each run.

... but then having said that we have all the firmwares in https://www.espruino.com/binaries/travis/master/ so one file per commit which listed all the test reports would probably work quite well as a starting point.

