const inquirer = require('inquirer');
const fs = require('fs');

require('dotenv').config();

// const questions = [

// ];

// function writeToFile(fileName, data) {
// }

// function init() {

// }

// init();

inquirer.prompt([
    {

    },
    {

    },
    {

    },
    {

    },
    {

    },
    {

    },
    {

    },
    {

    },
    {

    },
    {
    //[]
    }
]).then(function(data) {
    let filename = data.name.toLowerCase().split(' ').join('') + ".md";

    fs.writeFile(filename, md.stringify(data, null, '\t'), function(err) {
      
      if (err) {
        return console.log(err);
      }

      console.log("Success!");

    });
});