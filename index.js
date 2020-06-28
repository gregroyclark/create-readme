const inquirer = require('inquirer');
const fs = require('fs');
const util = require('util');

require('dotenv').config();

const writeFileAsync = util.promisify(fs.writeFile);

function promptUser() {
  return inquirer.prompt([
    {
        type: "input",
        name: "title",
        message: "What is the name of your project?"
    },
    {
        type: "input",
        name: "description",
        message: "Describe your project."
    },
    {
      type: "input",
      name: "install",
      message: "How do install & use your project?"
    },
    {
      type: "input",
      name: "license",
      message: "License:",
    },
    {
      type: "checkbox",
      name: "tech",
      message: "What technologies did you utilize for this project?",
      choices: [
        "HTML",
        " CSS",
        " JavaScript",
        " Node/Express.js",
        " Handlebars.js",
        " React.js",
        " Angular.js",
        " Vue.js",
        " MySQL",
        " MongoDB",
        " PostgresQL",
        " C",
        " Java",
        " Kotlin"
      ]
    },
    {
      type: "input",
      name: "github",
      message: "What is your GitHub username?"
    }
  ]);
}

function generateMarkdown(answers) {
  return `<h1 align= "center">${answers.title}</h1> 
  <h2>Table of Contents<h2>
  <ul>
  <li><a href="#descrip">Description</a></li>  
  <li><a href="#install">Installation</a></li> 
  <li><a href="#tech">Technology</a></li> 
  <li><a href="#use">Usage</a></li> 
  <li><a href="#license">License</a></li>
  <li><a href="#screen">Screenshots</a></li> 
  <li><a href="#contr">Contributors</a></li> 
  <li><a href="#quest">Questions</a></li>  
  </ul>
    <hr>
  <div id="descrip"><h2>Description</h2> </div>
  ${answers.description}
  <hr>
  <div id="install"><h2>Installation</h2> </div>
  <p>${answers.install}</p>
  <hr>
  <div id="tech"><h2>Technology</h2></div>           
  <p>${answers.tech}</p>
  <hr>
  <div id="use"><h2>Usage</h2></div>
  <p>Reference information</p>  
  <hr>
  <div id="license"><h2>License</h2></div>
  <p><img align="left" src= ${answers.license}></p><br>
  <hr>
  <div id="screen"><h2>Screenshots</h2></div>
  <p><img src= ""><img src= ""><img src= ""></p>
  <hr>
  <div id="contr"><h2>Contributors</h2> </div>

  GitHub       
  <ul>
  <li></li>
  <li>Github: <a href= "https://github.com/${answers.github}/">https://github.com/${answers.github}/</a></li>
  </ul> `;
}

async function init() {
  console.log("hi")
  try {
    const answers = await promptUser();

    const md = generateMarkdown(answers);

    await writeFileAsync("README.md", md);

    console.log("Successfully wrote to README.md");
  } catch(err) {
    console.log(err);
  }
}

init();
